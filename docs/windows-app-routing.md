# Windows application routing MVP

KokoroBox can route selected Windows applications without enabling system proxy or TUN. This
MVP is available on Windows 10/11 x64 only.

## User model

Open **Application routing** in the sidebar, enter a process pattern or select one or more
`.exe` files, then choose an action and protocol for each rule:

- **Proxy** sends TCP, UDP, or both through KokoroBox's dedicated Mihomo SOCKS5 listener.
- **Direct** explicitly leaves matching traffic untouched.
- **Block** drops matching traffic.

Rules can be enabled, disabled, reordered, edited, and deleted. They are persisted separately
from profiles and restored when KokoroBox starts. Matching is case-insensitive and accepts an
exact filename such as `ChatGPT.exe`, a filename wildcard such as `ChatGPT*.exe`, or a full path
pattern such as `C:\Program Files\*\ChatGPT.exe`. `*` matches any sequence; each rule contains
one pattern. Filename patterns survive application upgrades that move the executable into a new
versioned directory.

The system picker accepts `.exe` files only. It uses the stable executable filename as the
default `processPattern`, while retaining the selected canonical path only as the optional icon
source. KokoroBox persists the version 1 schema: `id`, `enabled`, `priority`, `processPattern`,
optional `sourcePath`, `protocol`, and `action`. The enclosing configuration requires
`failClosed: true`. Invalid development-time configuration files are discarded.

KokoroBox converts this canonical schema to the private sidecar command in `profile.ts`; an
upstream `.pbprofile` is never stored as application configuration.

## Runtime architecture

KokoroBox owns the UI and canonical user configuration. In service permission mode, the
authenticated Windows service owns the privileged process lifecycle, a hardened copy of the
active rules, and the authoritative health state. A headless, pinned build of ProxyBridge runs
as its controlled sidecar and uses WinDivert for packet interception. No ProxyBridge GUI,
updater, external proxy selection, or profile import/export is included.

While application routing is enabled, KokoroBox injects a dedicated SOCKS listener at
`127.0.0.1:7891` into its generated Mihomo runtime profile. It is removed when the feature is
disabled, binds only to loopback, and is independent of user-controlled mixed-port settings.
Remote endpoints and credentials cannot be supplied through this feature.

The packaged native process is `kokorobox-process-router.exe`. It accepts newline-delimited,
versioned JSON commands over inherited standard input and emits JSON lifecycle events. It does
not accept command-line profile paths, external proxy credentials, or update commands. Rules are
replaced inside the controlled process without restarting the executable. The native process
installs a highest-priority Block guard scoped to the old and new process patterns, rebuilds the
complete rule set behind that guard, and removes the guard only after the new list is ready. Rule
replacement may briefly block selected applications but does not interrupt unrelated processes
or expose a Direct window.

Mandatory Direct policy is inserted by the native process and cannot be removed through the UI.
It excludes KokoroBox, Mihomo, the privileged service, the process router, Electron crash/update
helpers, and the router's own process. Loopback, IPv4 link-local, multicast, broadcast, IPv6
link-local, and IPv6 multicast destinations are also Direct to prevent loops and avoid
intercepting local network control traffic.

ProxyBridge requires administrator access for WinDivert. In service mode, an ordinary user
KokoroBox process calls `/process-router/start`, `/stop`, `/rules`, `/status`, and `/cleanup` over
the existing SID-bound, Ed25519-authenticated service connection. The service launches only the
fixed packaged router path, never a caller-supplied executable or command line. Older services
that do not expose the versioned endpoint are rejected without falling back to Direct. Elevated
KokoroBox startup remains available as the non-service backend.

The service uses a short client lease. Authenticated status polling renews it while KokoroBox is
running. A normal exit stops the router immediately; if the UI crashes, lease expiry stops the
router and releases WinDivert while retaining the canonical rules for the next application start.

## Failure behavior

The privileged service probes the dedicated Mihomo listener before installing Proxy actions.
The sidecar stays active if the listener becomes unavailable; the service atomically replaces
every Proxy action with Block. When the listener becomes reachable again, Proxy actions are
restored. Explicit Direct and Block rules retain their configured action. The pinned KokoroBox
ProxyBridge fork treats a missing or incompatible proxy configuration as Block as an additional
defense-in-depth measure.

An unexpected sidecar or WinDivert failure is reported as an error and the service attempts to
restart it. There can still be a brief interception gap while a crashed sidecar or service
restarts; preventing leakage across a service crash requires a separate persistent WFP or
Windows Firewall kill switch and is outside this MVP.

## Reproducible native build

Every Windows x64 package runs `scripts/build-proxybridge.ps1` first. It checks out an exact commit
from the controlled KokoroBox ProxyBridge fork, verifies the WinDivert archive SHA-256, and
packages only the KokoroBox router, core DLL, WinDivert runtime, and license files. See
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) for attribution.

The packaged files live under `extra/files/process-router/`; the upstream `.sys` payload is
copied byte-for-byte from the pinned, SHA-256-verified WinDivert archive. The runtime verifies a
build manifest before launching the sidecar. Release collection publishes the CycloneDX SBOM as
a standalone artifact and includes it in `SHA256SUMS`; the SBOM records the pinned ProxyBridge
source revision.

## Signing and Windows verification

The WinDivert driver remains the unmodified upstream signed payload. The KokoroBox router, core
DLL, Electron executable, and installer still require a trusted Authenticode signing identity.
The current repository has no Windows certificate or approved SignPath policy, so CI must not
claim that these files are signed. Do not publicly enable this feature in a release until signing
is configured and verified with `Get-AuthenticodeSignature` (or SignPath's signed-artifact
verification) for every executable and DLL.

The automated suite covers strict schema validation, the authenticated service contract,
ordering, disabled rules, mandatory policy generation, fail-closed command generation, SOCKS5
greeting validation, provenance, and binary hash failures. Packet interception, TCP/UDP routing,
IPv4/IPv6 behavior, crash leakage, sleep/resume, upgrade/uninstall cleanup,
standard-user/service operation, and Microsoft Defender must be exercised on clean Windows 10
and Windows 11 x64 virtual machines before release.
