package dnsapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/amamiyakokoro/kokorobox-service/sys"
	"github.com/go-chi/chi/v5"
)

type desktopDNSEndpoint struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Body   struct {
		Servers []string `json:"servers"`
	} `json:"body"`
}

type desktopDNSContract struct {
	DNSLease   desktopDNSEndpoint `json:"dnsLease"`
	DNSRenew   desktopDNSEndpoint `json:"dnsRenew"`
	DNSRelease desktopDNSEndpoint `json:"dnsRelease"`
}

type desktopDNSBackend struct {
	servers []string
}

func (b *desktopDNSBackend) ActiveDNSService() (sys.DNSService, error) {
	return sys.DNSService{ID: "contract", Name: "Test Network"}, nil
}
func (b *desktopDNSBackend) GetDns(string) ([]string, error) {
	return append([]string(nil), b.servers...), nil
}
func (b *desktopDNSBackend) SetDns(_ string, servers []string) error {
	b.servers = append([]string(nil), servers...)
	return nil
}

func TestDesktopContractDNSLease(t *testing.T) {
	data, err := os.ReadFile(os.Getenv("DESKTOP_SERVICE_CONTRACT"))
	if err != nil {
		t.Fatal(err)
	}
	var contract desktopDNSContract
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}
	backend := &desktopDNSBackend{servers: []string{"192.0.2.53"}}
	previous := global
	global = &manager{backend: backend, path: filepath.Join(t.TempDir(), "lease.json")}
	t.Cleanup(func() { global.stopTimers(); global = previous })

	routes := chi.NewRouter()
	routes.Mount("/network/dns", Router())
	request := func(endpoint desktopDNSEndpoint, body []byte) {
		t.Helper()
		response := httptest.NewRecorder()
		routes.ServeHTTP(response, httptest.NewRequest(endpoint.Method, endpoint.Path, bytes.NewReader(body)))
		if response.Code != http.StatusNoContent {
			t.Fatalf("%s %s returned %d: %s", endpoint.Method, endpoint.Path, response.Code, response.Body.String())
		}
	}

	leaseBody, err := json.Marshal(contract.DNSLease.Body)
	if err != nil {
		t.Fatal(err)
	}
	request(contract.DNSLease, leaseBody)
	if !reflect.DeepEqual(backend.servers, contract.DNSLease.Body.Servers) {
		t.Fatalf("DNS lease was not applied: %v", backend.servers)
	}
	request(contract.DNSRenew, nil)
	request(contract.DNSRelease, nil)
	if !reflect.DeepEqual(backend.servers, []string{"192.0.2.53"}) {
		t.Fatalf("DNS lease was not restored: %v", backend.servers)
	}
}
