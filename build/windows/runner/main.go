//go:build windows

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

const (
	messageBoxTitle = "KokoroBox Runner"
	maxParamsSize   = 64 * 1024
)

var (
	user32          = syscall.NewLazyDLL("user32.dll")
	procMessageBoxW = user32.NewProc("MessageBoxW")
)

func main() {
	if err := run(); err != nil {
		showError("Error: " + err.Error())
	}
}

func run() error {
	if len(os.Args) != 3 {
		return errors.New("invalid arguments")
	}

	appPath := filepath.Clean(os.Args[1])
	paramsPath := filepath.Clean(os.Args[2])
	if !filepath.IsAbs(appPath) || !strings.EqualFold(filepath.Ext(appPath), ".exe") {
		return errors.New("invalid application path")
	}
	if !filepath.IsAbs(paramsPath) {
		return errors.New("invalid parameter path")
	}
	if info, err := os.Stat(appPath); err != nil || info.IsDir() {
		return fmt.Errorf("application does not exist: %s", appPath)
	}

	params, err := readParams(paramsPath)
	if err != nil {
		return err
	}
	if err := exec.Command(appPath, params...).Start(); err != nil {
		return fmt.Errorf("failed to start KokoroBox: %w", err)
	}
	return nil
}

func readParams(paramsPath string) ([]string, error) {
	content, err := os.ReadFile(paramsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, errors.New("failed to read startup parameters")
	}
	_ = os.Remove(paramsPath)
	if len(content) > maxParamsSize {
		return nil, errors.New("startup parameters are too large")
	}

	var params []string
	if err := json.Unmarshal(content, &params); err != nil {
		return nil, errors.New("invalid startup parameters")
	}
	for _, param := range params {
		lower := strings.ToLower(param)
		if len(param) > 8192 ||
			(!strings.HasPrefix(lower, "clash://") &&
				!strings.HasPrefix(lower, "mihomo://") &&
				!strings.HasPrefix(lower, "sparkle://")) {
			return nil, errors.New("unsafe startup parameter")
		}
	}
	return params, nil
}

func utf16String(value string) *uint16 {
	encoded := utf16.Encode([]rune(value + "\x00"))
	return &encoded[0]
}

func showError(message string) {
	procMessageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(utf16String(message))),
		uintptr(unsafe.Pointer(utf16String(messageBoxTitle))),
		uintptr(0x10),
	)
}
