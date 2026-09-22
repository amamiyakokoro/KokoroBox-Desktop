package sysproxyapi

import (
	"encoding/json"
	"os"
	"testing"
)

type desktopSysproxyEndpoint struct {
	Method string       `json:"method"`
	Path   string       `json:"path"`
	Body   proxyRequest `json:"body"`
}

type desktopSysproxyContract struct {
	PAC     desktopSysproxyEndpoint `json:"sysproxyPac"`
	Proxy   desktopSysproxyEndpoint `json:"sysproxyProxy"`
	Disable desktopSysproxyEndpoint `json:"sysproxyDisable"`
}

func TestDesktopContractSysproxyPayloads(t *testing.T) {
	data, err := os.ReadFile(os.Getenv("DESKTOP_SERVICE_CONTRACT"))
	if err != nil {
		t.Fatal(err)
	}
	var contract desktopSysproxyContract
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}
	if contract.PAC.Body.Url != "http://127.0.0.1:7890/pac" || !contract.PAC.Body.Guard {
		t.Fatalf("unexpected PAC payload: %+v", contract.PAC.Body)
	}
	if contract.Proxy.Body.Server != "127.0.0.1:7890" || contract.Proxy.Body.Bypass == "" || !contract.Proxy.Body.Guard {
		t.Fatalf("unexpected proxy payload: %+v", contract.Proxy.Body)
	}
	if contract.Disable.Body.Device != "Wi-Fi" || !contract.Disable.Body.OnlyActiveDevice || contract.Disable.Body.UseRegistry {
		t.Fatalf("unexpected disable payload: %+v", contract.Disable.Body)
	}
}
