package processrouter

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type desktopProcessRouterEndpoint struct {
	Method string       `json:"method"`
	Path   string       `json:"path"`
	Body   RulesRequest `json:"body"`
}

type desktopProcessRouterContract struct {
	Rules desktopProcessRouterEndpoint `json:"processRouterRules"`
}

func TestDesktopContractProcessRouterProtocol(t *testing.T) {
	data, err := os.ReadFile(os.Getenv("DESKTOP_SERVICE_CONTRACT"))
	if err != nil {
		t.Fatal(err)
	}
	var contract desktopProcessRouterContract
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}
	normalized, err := normalizeRulesRequest(contract.Rules.Body)
	if err != nil {
		t.Fatalf("Desktop rules payload is invalid: %v", err)
	}
	if len(normalized.Rules) != 1 || normalized.Rules[0].ExecutablePath != "/usr/bin/example" {
		t.Fatalf("unexpected normalized rules: %+v", normalized.Rules)
	}

	status, err := json.Marshal(Status{
		Version:                   ProtocolVersion,
		Supported:                 true,
		State:                     StateStopped,
		Generation:                1,
		MihomoAvailable:           true,
		FirewallReady:             false,
		ProtectedApplicationCount: 1,
		Backend:                   "linux-cgroup-v2",
		ProxyPort:                 LinuxProxyPort,
	})
	if err != nil {
		t.Fatal(err)
	}
	responseDir := os.Getenv("DESKTOP_SERVICE_CONTRACT_RESPONSES")
	if err := os.WriteFile(filepath.Join(responseDir, "process-router-status.json"), status, 0o600); err != nil {
		t.Fatal(err)
	}
}
