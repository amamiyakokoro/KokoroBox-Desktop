# Windows application routing MVP

KokoroBox can route selected Windows applications without enabling system proxy or TUN. This
MVP is available on Windows 10/11 x64 only.

## User model

Open **Application routing** in the sidebar, add one or more `.exe` files, then choose an
action and protocol for each rule:

- **Proxy** sends TCP, UDP, or both through the active local Mihomo SOCKS5 listener.
- **Direct** explicitly leaves matching traffic untouched.
- **Block** drops matching traffic.

Rules can be enabled, disabled, reordered, and deleted. They are persisted separately from
profiles and restored when KokoroBox starts. ProxyBridge currently identifies applications by
executable basename, so KokoroBox rejects a second rule with the same `.exe` name even when its
path differs.

## Runtime architecture

KokoroBox owns the UI, persistent configuration, generated profile, process lifecycle, and
health state. A headless, pinned build of ProxyBridge runs as a controlled sidecar and uses
WinDivert for packet interception. No ProxyBridge GUI, updater, external proxy selection, or
profile import/export is included.

The generated sidecar profile always contains a single SOCKS5 endpoint on `127.0.0.1`. KokoroBox
prefers Mihomo's configured `socks-port` and otherwise uses `mixed-port`; remote endpoints and
credentials cannot be supplied through this feature.

ProxyBridge requires administrator access for WinDivert. The normal elevated KokoroBox startup
mode provides it. Service-mode integration is not part of this MVP and must be validated before
the feature is enabled from a non-elevated UI process.

## Failure behavior

The sidecar stays active if the Mihomo listener becomes unavailable. Connections matching a
**Proxy** rule fail closed and are not changed to Direct; explicit Direct rules remain direct.
The packaged ProxyBridge source receives an additional patch that also treats a missing or
incompatible proxy configuration as Block.

An unexpected sidecar or WinDivert failure is reported as an error and KokoroBox attempts to
restart it. There can be a brief interception gap while a crashed sidecar restarts; production
hardening beyond this MVP should move supervision into an elevated Windows service.

## Reproducible native build

`scripts/build-proxybridge.ps1` builds only in the Windows x64 release job. It checks out an exact
ProxyBridge commit, verifies the WinDivert archive SHA-256, applies the fail-closed patch, and
packages only the CLI, core DLL, WinDivert runtime, and license files. See
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) for attribution.
