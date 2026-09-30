# System Proxy Diagnostics boundaries

The diagnostics UI remains in Settings → Diagnostics, with its existing
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
AppContainer information. Linux adds `linux` details for desktop/backend/mode,
process-scoped environment variables and Portal resolution. macOS adds `macos`
details for effective settings, services in the current Network Location and
the primary IPv4/IPv6 services. No new IPC entry point is required.

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
KokoroBox controller pipe. On Unix, it supports the fixed standard, unprivileged
and external-core controller sockets already used by Desktop. No caller-supplied
socket path or proxy port is accepted. Permission failures remain unknown rather
than becoming a false stopped-core result. Managed cores use the existing Service core manager and its private
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

Windows and macOS diagnostics restore/enable/disable use Native, with a freshly obtained Service endpoint.
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

## macOS diagnostics

Native reads SystemConfiguration directly: `SCDynamicStoreCopyProxies` provides
effective protocol settings; the IPv4/IPv6 global dynamic-store entries identify
the primary Network Services. The current `SCNetworkSet` supplies Network
Location and service membership. Per-service settings prefer dynamic state and
fall back to the service's Proxies protocol configuration. Missing secondary
context has stable error codes and does not discard effective settings.

Desktop compares effective HTTP and HTTPS independently with the Service's live
endpoint, and checks both primary services when IPv4 and IPv6 use different
services. A matching proxy on an inactive service cannot establish health.
Switching to an unconfigured primary service is identified separately, with
other services shown as context. PAC and Auto Proxy Discovery are warnings in
manual mode when HTTP/HTTPS still match; Network Location is context, not a
failure. VPN/Network Extension and application behavior rows are informational.
The existing modal, refresh, report and Service runtime/remediation APIs are reused.

Explicit Native writes use a locked SCPreferences transaction, commit and apply.
The existing `onlyActiveDevice` intent is preserved: enabled services with live
addresses are targeted when true; all enabled services in the current location
remain targets when false. Manual restoration sets HTTP, HTTPS and SOCKS, and
preserves PAC and discovery. Disable leaves foreign PAC and discovery unchanged;
it may disable KokoroBox's local PAC. No environment variables are modified.

Read-only diagnostics never prompt for elevation. If a write is denied, Native
reuses its existing AppleScript administrator mechanism once with fixed,
quoted `networksetup` mutation arguments. This fallback is bounded at 90 seconds;
Desktop permits 120 seconds for that explicit action, while reads remain bounded
at four seconds. Raw command output never crosses IPC.

The legacy Service guard and lease cleanup can clear macOS automatic settings.
Native therefore returns `automaticSettingsPreserved` after a mutation. Desktop
keeps that guard, lease renewal and automatic cleanup suspended when preserving
PAC/discovery, rather than adopting a lease whose cleanup would erase them.
The repair action explains this tradeoff. Ordinary repairs without automatic
settings retain the existing adoption and crash-cleanup behavior.

References: [Apple SystemConfiguration](https://developer.apple.com/documentation/systemconfiguration),
[Network configuration](https://developer.apple.com/documentation/systemconfiguration/scnetworkconfiguration).

## Linux diagnostics (first phase)

Native selects the active desktop from `XDG_CURRENT_DESKTOP` / `DESKTOP_SESSION`,
and confirms the selected backend can be read. An installed GNOME schema does
not make an unrelated compositor a GNOME desktop. Supported backends are GNOME
(including desktops using GNOME settings) and KDE Plasma/KIO. Other desktops
use an informational `environment` or `unsupported` backend, with `enabled: null`.
Environment variables are never written or treated as a desktop-wide setter.

GNOME reads only mode, HTTP/HTTPS/SOCKS host/port, PAC URL and ignore-hosts using
fixed `gsettings get` arguments. It parses GVariant strings/arrays inside Native,
including typed empty arrays. Deprecated `use-same-proxy` and HTTP `enabled` keys
are ignored. KDE uses `kreadconfig6` / `kreadconfig5` rather than a hand-written
home-file parser, preserving KConfig defaults and cascaded locations. The reader
is selected by querying `ProxyType`, with a fallback to KDE 5 when the KDE 6
utility is absent. The queried mode is reused in the snapshot. Missing readers,
permission failures, invalid settings and timeouts produce distinct diagnostic
details while preserving runtime, environment and Portal results. Modes
none/manual/PAC/WPAD/environment, legacy host-space-port values and reversed
exceptions are normalized. KDE environment mode resolves configured variable
names inside Native. All utility calls have one shared 1.5-second deadline,
bounded output, null stderr, and terminate/reap timed-out children. No shell runs.

The eight usual lowercase/uppercase proxy variables are inspected only in
KokoroBox's inherited process environment. URI credentials, paths and queries
are removed before IPC; other processes may inherit different values. Desktop
compares safe endpoints with the Service endpoint and warns about differences,
invalid values or unusually broad `no_proxy`. It does not export any variables.

Native queries the user-session D-Bus
`org.freedesktop.portal.ProxyResolver.Lookup` for the HTTPS connectivity target,
with a one-second method timeout inside the shared diagnostic budget. Portal
results are structured endpoints/direct status, never raw D-Bus/command output.
This is resolver information, not another public connectivity probe. A direct
or different Portal response warns when a matching desktop proxy is expected;
unavailable Portal information is an informational row and does not fail runtime.
It cannot guarantee access for every Flatpak or sandboxed application.

Desktop reuses the Windows evaluator's runtime rows and Service actions. Linux
configuration rows compare both HTTP and HTTPS and preserve desired/actual state.
Unsupported desktops still receive core/listener/connectivity results, without
claiming a healthy global system proxy. Backend failures preserve environment and
Portal information; Service failures preserve OS settings. The modal and existing
Run again / Copy report behavior are unchanged, with English and both Chinese
catalogs. Linux OS diagnostics are read-only in this phase: conflicts instruct the
user to review desktop network settings; start/restart retain Service management.
The existing Linux System Proxy toggle/setter is outside this change.

References: [GNOME proxy schema](https://github.com/GNOME/gsettings-desktop-schemas/blob/master/schemas/org.gnome.system.proxy.gschema.xml.in),
[KDE proxy settings](https://docs.kde.org/stable_kf6/en/kio-extras/kcontrol6/proxy/),
[XDG Portal ProxyResolver](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ProxyResolver.html).

## Partial results, privacy and deployment

Native and Service requests settle independently. Unknown runtime data is not
reported as a wrong port; OS rows remain visible when Service fails. WinHTTP and
AppContainer inspection failures warn on their own rows without failing otherwise
healthy connectivity. PAC and bypass differences remain warnings unless the
active proxy address or selected PAC mode conflicts.

A failed Service diagnostic request produces `runtime-unavailable`, not a core
configuration or connectivity failure. Core, configuration, listener and
connectivity rows remain informational and unverified; listener/connectivity
state is null. A separate warning retains stable causes for unsupported endpoints
(HTTP 404/405), authentication (401), permission (403), timeout, invalid response
or other request failures. Raw errors and response bodies never enter the report.
Confirmed runtime failures from a valid Service response still produce errors.

On macOS, updating the app's bundled Service binary does not necessarily replace
an already running daemon. An unsupported endpoint explains how to update/restart
Service in Core runtime settings and run diagnostics again. Diagnostics never
restart Service automatically or infer the runtime endpoint from OS/UI settings.

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
Native tests cover endpoint/settings validation, Linux backend/mode parsing,
credential removal, bounded utility execution and redacted diagnostic logging.
Linux Desktop tests cover GNOME/KDE matches, disabled intent/state conflicts,
wrong/missing HTTPS ports, runtime failures, PAC/WPAD/reversed exceptions, broad
bypass, both environment casings, Portal mismatch/unavailability, unsupported
desktops and independent Native/Service failure. Linux session behavior must
also be verified on GNOME and Plasma with rebuilt artifacts.

macOS tests cover independent HTTP/HTTPS settings, disabled intent/state, wrong
ports, changed primary service/location, inactive-only proxy settings, distinct
IPv4/IPv6 services, PAC/discovery/bypass warnings, independent runtime failures,
partial Native results, safe reports, scope forwarding and guard suspension.
Native tests check normalization and both API/fallback mutation plans without
changing host settings. A rebuilt NAPI binding was exercised against this Mac
for read-only effective/service/location retrieval. Actual privileged writes and
live service/location switching still require manual verification.

Run the Desktop `test:system-proxy`, `test:service-contract`, `test:service-auth`,
`test:runtime-recovery` and `test:localization` scripts; Native's Rust library and
NAPI diagnostic tests; and Service's `go test ./...`. Windows runtime behavior
must also be exercised with the newly built Native/Service artifacts on Windows.
