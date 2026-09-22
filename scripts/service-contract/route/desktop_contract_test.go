package route

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/amamiyakokoro/kokorobox-service/route/coreapi"
)

type desktopEndpoint struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

type desktopContract struct {
	Meta                        desktopEndpoint `json:"meta"`
	CoreDesired                 desktopEndpoint `json:"coreDesired"`
	DNSLease                    desktopEndpoint `json:"dnsLease"`
	DNSRenew                    desktopEndpoint `json:"dnsRenew"`
	DNSRelease                  desktopEndpoint `json:"dnsRelease"`
	SysproxyStatus              desktopEndpoint `json:"sysproxyStatus"`
	SysproxyEvents              desktopEndpoint `json:"sysproxyEvents"`
	SysproxyPAC                 desktopEndpoint `json:"sysproxyPac"`
	SysproxyProxy               desktopEndpoint `json:"sysproxyProxy"`
	SysproxyDisable             desktopEndpoint `json:"sysproxyDisable"`
	SysproxyRenew               desktopEndpoint `json:"sysproxyRenew"`
	ProcessRouterStart          desktopEndpoint `json:"processRouterStart"`
	ProcessRouterStop           desktopEndpoint `json:"processRouterStop"`
	ProcessRouterRules          desktopEndpoint `json:"processRouterRules"`
	ProcessRouterStatus         desktopEndpoint `json:"processRouterStatus"`
	ProcessRouterFirewallRepair desktopEndpoint `json:"processRouterFirewallRepair"`
	ProcessRouterCleanup        desktopEndpoint `json:"processRouterCleanup"`
}

func loadDesktopContract(t *testing.T) desktopContract {
	t.Helper()
	data, err := os.ReadFile(os.Getenv("DESKTOP_SERVICE_CONTRACT"))
	if err != nil {
		t.Fatal(err)
	}
	var contract desktopContract
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}
	return contract
}

func TestDesktopContractRoutesAndResponses(t *testing.T) {
	contract := loadDesktopContract(t)
	serviceRouter := router("")
	missing := httptest.NewRecorder()
	serviceRouter.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/desktop-contract-missing", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("route probe cannot distinguish missing endpoints: %d", missing.Code)
	}
	for _, endpoint := range []desktopEndpoint{
		contract.Meta, contract.CoreDesired, contract.DNSLease,
		contract.DNSRenew, contract.DNSRelease,
		contract.SysproxyStatus, contract.SysproxyEvents, contract.SysproxyPAC,
		contract.SysproxyProxy, contract.SysproxyDisable, contract.SysproxyRenew,
		contract.ProcessRouterStart, contract.ProcessRouterStop,
		contract.ProcessRouterRules, contract.ProcessRouterStatus,
		contract.ProcessRouterFirewallRepair, contract.ProcessRouterCleanup,
	} {
		request := httptest.NewRequest(endpoint.Method, endpoint.Path, nil)
		response := httptest.NewRecorder()
		serviceRouter.ServeHTTP(response, request)
		if response.Code == http.StatusNotFound || response.Code == http.StatusMethodNotAllowed {
			t.Errorf("%s %s is not registered: %d", endpoint.Method, endpoint.Path, response.Code)
		}
	}

	meta := httptest.NewRecorder()
	metaStatus(meta, httptest.NewRequest(contract.Meta.Method, contract.Meta.Path, nil))
	if meta.Code != http.StatusOK {
		t.Fatalf("GET meta returned %d", meta.Code)
	}
	responseDir := os.Getenv("DESKTOP_SERVICE_CONTRACT_RESPONSES")
	if err := os.WriteFile(filepath.Join(responseDir, "meta.json"), meta.Body.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}

	core := httptest.NewRecorder()
	coreapi.Router().ServeHTTP(core, httptest.NewRequest(http.MethodGet, "/desired", nil))
	if core.Code != http.StatusOK {
		t.Fatalf("GET core desired state returned %d: %s", core.Code, core.Body.String())
	}
	if err := os.WriteFile(filepath.Join(responseDir, "core-desired.json"), core.Body.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
}
