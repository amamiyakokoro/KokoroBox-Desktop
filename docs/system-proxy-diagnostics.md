# System Proxy Diagnostics boundaries

The Windows diagnostics UI remains in Settings → Diagnostics, with its existing
Network settings shortcut. The toggle expresses intent; diagnostics compare that
intent with actual OS configuration and separately report runtime health.

## Audit and ownership

| Previously in Desktop                                                        | Owner after refactor | Boundary                                               |
| ---------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------ |
| `reg.exe` reads of ProxyEnable, ProxyServer, ProxyOverride and AutoConfigURL | Native               | `getSystemProxyDiagnostics()`                          |
| `netsh winhttp dump` and stdout parsing                                      | Native               | WinHTTP API; structured Windows details                |
| UWP exemption enumeration                                                    | Native               | Existing NetworkIsolation API; exemption count only    |
| Direct child/service status inspection and live `/configs` query             | Service              | `GET /core/proxy-diagnostics`                          |
| TCP socket probing                                                           | Service              | Listener result with stable error code                 |
| HTTPS CONNECT and outbound response validation                               | Service              | Explicit proxy transport with certificate verification |
| Expected/current comparison, status priority, sanitization and report        | Desktop              | Shared evaluator and diagnostics aggregator            |

The obsolete Desktop Windows command adapter, socket/HTTP probe module, and
special-purpose core/controller diagnostic reads have been removed. Native and
Service do not import or call one another.

## Native contract

`kokorobox-native` exposes `getSystemProxyDiagnostics()` and
`setSystemProxy(settings)`. Settings select `manual`, `auto`, or `disabled`; the
same setter covers enable, restore, and clear, without redundant APIs.

The diagnostic response uses common platform, availability, enabled, protocol
endpoints, PAC and bypass fields. `windows` contains registry values, WinHTTP
status and AppContainer information. Each secondary item has its own availability
and stable error code. Registry failure therefore does not discard WinHTTP or
AppContainer information. macOS/Linux currently return `unsupported` with an
unknown enabled state; adding OS support requires no new IPC entry point.

Windows uses Registry, WinINet, WinHTTP and NetworkIsolation APIs rather than
utilities. Calls execute asynchronously in the user process, so HKCU refers to
the Desktop user rather than the Service account. Desktop bounds native IPC at
four seconds. Native never changes WinHTTP or AppContainer exemptions here.

## Service contract

`GET /core/proxy-diagnostics` returns core running/readiness/error code, the loaded
proxy endpoint, independent listener availability and outbound connectivity.
The mixed port comes from the live controller; the HTTP port is used when the
mixed port is disabled. Missing configuration produces a null port, never a
static configuration guess.

`direct=true` diagnoses the existing Windows direct core through the fixed
KokoroBox controller pipe. No caller-supplied socket path or proxy port is
accepted. Managed cores use the existing Service core manager and its private
controller. Core startup errors reuse existing lifecycle state and return codes,
not raw log/configuration text.

Controller, listener and outbound deadlines are 2.5, 1.2 and 5 seconds; Desktop
bounds the service request at 10 seconds. Outbound requests use Go's HTTP library,
an explicit local HTTP proxy and verified HTTPS to gstatic's `generate_204`.
A TCP handshake alone is insufficient, redirects fail, and there is no direct
or environment-proxy fallback. No public request occurs if the listener is down.
`probe=false` refreshes runtime data for an explicit restore action without
performing another public connectivity test.

## Actions and lease integration

Restore/enable/disable use Native, with a freshly obtained Service endpoint.
The operation queue still persists intent and publishes toggle state.
`POST /sysproxy/native/prepare` suspends the old Service guard and lease before
Native writes; `POST /sysproxy/native/adopt` confirms and adopts that configuration
for existing crash cleanup, renewal and guard behavior. Neither handler performs
an OS write. This reuses legacy lease management rather than introducing another
guard or lifecycle manager.

Start/restart actions use Service. For a directly launched core, the action hint
explains the switch to Service management; the existing ownership-transfer/startup
orchestrator generates the launch profile and stops the legacy direct core.
This explicit repair cannot silently fall back to a directly launched core.
Failure restores the previous permission intent and remains visible to the user.

## Partial results, privacy and deployment

Native and Service requests settle independently. Unknown runtime data is not
reported as a wrong port; OS rows remain visible when Service fails. WinHTTP and
AppContainer inspection failures warn on their own rows without failing otherwise
healthy connectivity. PAC and bypass differences remain warnings unless the
active proxy address or selected PAC mode conflicts.

The renderer and clipboard receive only sanitized diagnostic results. Arbitrary
PAC URLs, credentials, non-local endpoints, custom bypass domains, raw backend
errors and full core configuration are omitted. Each layer logs its own work;
Desktop logs only completion and the overall status.

Ship the Native binding and Service binary from these coordinated source changes
before updating Desktop's release pins. An older binding or Service returns
unavailable diagnostics; Desktop deliberately does not restore low-level fallbacks.
This refactor does not publish backend releases or replace installed system
services automatically.

## Verification

Desktop boundary tests cover the 13 requested Windows scenarios, independent
backend failures, on-demand/coalesced refresh, sanitized reports, remediation,
Service migration and bounded IPC. Service tests use real local TCP and TLS/CONNECT
fixtures for closed ports, tunnel rejection, authentication, timeout, verified
204 success and redirect failure, plus loaded mixed/HTTP ports and failed config.
Native tests cover endpoint/settings validation and redacted diagnostic logging.

Run the Desktop `test:system-proxy`, `test:service-contract`, `test:service-auth`,
`test:runtime-recovery` and `test:localization` scripts; Native's Rust library and
NAPI diagnostic tests; and Service's `go test ./...`. Windows runtime behavior
must also be exercised with the newly built Native/Service artifacts on Windows.
