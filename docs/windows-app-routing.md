# Windows application routing MVP

KokoroBox can route selected Windows applications without enabling system proxy or TUN. This
MVP is available on Windows 10/11 x64 only.

## User model

Open **Application routing** in the sidebar, add one or more `.exe` files, then choose an
action and protocol for each rule:

- **Proxy** sends TCP, UDP, or both through KokoroBox's dedicated Mihomo SOCKS5 listener.
- **Direct** explicitly leaves matching traffic untouched.
- **Block** drops matching traffic.

Rules can be enabled, disabled, reordered, and deleted. They are persisted separately from
profiles and restored when KokoroBox starts. Matching uses the canonical, case-insensitive full
executable path, so unrelated applications with the same `.exe` basename remain independent.

The system picker accepts `.exe` files only. KokoroBox resolves each selection to its canonical
path and persists only the versioned KokoroBox schema: `id`, `enabled`, `priority`,
`executablePath`, `executableName`, `protocol`, and `action`. The enclosing configuration also
requires `failClosed: true`. Icons are an application-owned cache derived from the canonical path
and are not part of the rules schema. Process wildcards are rejected.

KokoroBox converts this canonical schema to the private sidecar command in `profile.ts`; an
upstream `.pbprofile` is never stored as application configuration.

## Runtime architecture

KokoroBox owns the UI, persistent configuration, generated profile, process lifecycle, and
health state. A headless, pinned build of ProxyBridge runs as a controlled sidecar and uses
WinDivert for packet interception. No ProxyBridge GUI, updater, external proxy selection, or
profile import/export is included.

While application routing is enabled, KokoroBox injects a dedicated SOCKS listener at
`127.0.0.1:7891` into its generated Mihomo runtime profile. It is removed when the feature is
disabled, binds only to loopback, and is independent of user-controlled mixed-port settings.
Remote endpoints and credentials cannot be supplied through this feature.

The packaged native process is `kokorobox-process-router.exe`. It accepts newline-delimited,
versioned JSON commands over inherited standard input and emits JSON lifecycle events. It does
not accept command-line profile paths, external proxy credentials, or update commands. Rules are
replaced inside the controlled process without restarting the executable. The native process
installs a highest-priority Block guard scoped to the old and new executable paths, rebuilds the
complete rule set behind that guard, and removes the guard only after the new list is ready. Rule
replacement may briefly block selected applications but does not interrupt unrelated processes
or expose a Direct window.

Mandatory Direct policy is inserted by the native process and cannot be removed through the UI.
It excludes KokoroBox, Mihomo, the privileged service, the process router, Electron crash/update
helpers, and the router's own process. Loopback, IPv4 link-local, multicast, broadcast, IPv6
link-local, and IPv6 multicast destinations are also Direct to prevent loops and avoid
intercepting local network control traffic.

ProxyBridge requires administrator access for WinDivert. The normal elevated KokoroBox startup
mode provides it. The authenticated client contract reserves `/process-router/start`, `/stop`,
`/rules`, `/status`, and `/cleanup`. The service source is maintained outside this repository, so
service mode remains disabled for application routing until those handlers and their capability
check are shipped.

## Failure behavior

KokoroBox completes a SOCKS5 no-authentication handshake with the dedicated Mihomo listener
before installing Proxy actions. The sidecar stays active if the listener becomes unavailable;
KokoroBox atomically replaces every Proxy action with Block. When the handshake succeeds again,
the Proxy actions are restored. Explicit Direct and Block rules retain their configured action.
The packaged ProxyBridge source receives an additional defense-in-depth patch that treats a
missing or incompatible proxy configuration as Block.

An unexpected sidecar or WinDivert failure is reported as an error and KokoroBox attempts to
restart it. There can be a brief interception gap while a crashed sidecar restarts; production
hardening beyond this MVP should move supervision into an elevated Windows service.

## Reproducible native build

`scripts/build-proxybridge.ps1` builds only in the Windows x64 release job. It checks out an exact
ProxyBridge commit, verifies the WinDivert archive SHA-256, applies the fail-closed patch, and
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

The automated suite covers schema validation and migration, ordering, disabled rules, mandatory
policy generation, fail-closed command generation, SOCKS5 greeting validation, provenance, and
binary hash failures. Packet interception, TCP/UDP routing, IPv4/IPv6 behavior, crash leakage,
sleep/resume, upgrade/uninstall cleanup, standard-user/service operation, and Microsoft Defender
must be exercised on clean Windows 10 and Windows 11 x64 virtual machines before release.
