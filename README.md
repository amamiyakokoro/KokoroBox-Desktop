<div align="center">

<img src="images/kokorobox-readme.png" width="128" height="128" alt="KokoroBox">

# KokoroBox-Desktop

A cross-platform Mihomo desktop client with built-in Kokoro subscriptions.

[Download](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases) · [Build](#development) · [Privacy](PRIVACY_POLICY.md) · [License](LICENSE)

</div>

## Highlights

- Bundled stable and preview [Mihomo](https://github.com/MetaCubeX/mihomo) cores
- System proxy, TUN, DNS, sniffing, routing, and profile controls
- Per-application Proxy, Direct, and Block routing powered by a controlled
  [ProxyBridge fork](https://github.com/amamiyakokoro/ProxyBridge)
- Secure osu! OAuth sign-in for Kokoro subscriptions
- Kokoro subscription options and editable `default` custom rules
- Profile overrides and automatic subscription updates
- WebDAV backup and restore
- English, Simplified Chinese, and Traditional Chinese localization

## Kokoro

Open **Kokoro Settings** from the sidebar, sign in through osu! in the system browser, choose the subscription options, then select **Get and add**. The Kokoro shortcut is also the first item in the subscription page's **+** menu.

After sign-in, the same page can edit the Kokoro `default` custom rule set. Authentication uses PKCE S256 and system-protected credential storage; see the [client API guide](docs/kokoro-client-api.md).

> Never include tokens, credentials, generated profiles, or complete subscription URLs in logs and issue reports.

## Application routing

**Application routing** sends only selected applications through KokoroBox without requiring
system proxy or TUN. Add an executable or application, choose TCP, UDP, or both, then assign a
**Proxy**, **Direct**, or **Block** action. Rules are ordered, persisted, and restored at startup.

- **Windows 10/11 x64:** a headless ProxyBridge sidecar uses WinDivert and the authenticated
  KokoroBox privileged service. Windows ARM64 is not supported.
- **macOS 13+:** an experimental ProxyBridge transparent-proxy System Extension supports Apple
  Silicon and Intel. macOS asks the user to approve the extension before first use.
- **Linux x64/arm64:** an experimental root-service backend prefers cgroup v2 and falls back to
  cgroup v1 `net_cls`. It uses policy routing and TPROXY without creating a TUN interface.

Windows and macOS Proxy traffic uses a dedicated loopback-only Mihomo SOCKS5 listener. Linux
uses a guarded Mihomo TPROXY listener on port 7894. If Mihomo becomes unavailable, matching
Proxy rules fail closed as Block instead of leaking through Direct. KokoroBox, Mihomo, routing
components, loopback, link-local, multicast, and broadcast traffic are always excluded to
prevent proxy loops.

KokoroBox builds a pinned ProxyBridge revision from source and packages only the controlled
routing components—not the upstream GUI, updater, or external proxy configuration. See the
[Windows MVP](docs/windows-app-routing.md), [macOS integration](docs/macos-app-routing.md),
[Linux cgroup routing](docs/linux-app-routing.md), and [third-party notices](THIRD_PARTY_NOTICES.md)
for architecture, verification status, and licenses.

## Install

Download a package for Windows, macOS, or Linux from [GitHub Releases](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases). Releases include `SHA256SUMS` for verification:

```bash
shasum -a 256 -c SHA256SUMS --ignore-missing
```

Windows packages are currently unsigned. On macOS, install the PKG so the bundled Mihomo core
and optional application-routing System Extension can receive the required permissions.

## Development

Requires Node.js 22.12+ and pnpm 11. Windows package preparation also requires Go 1.23+;
building the macOS application-routing payload requires Xcode.

```bash
git clone https://github.com/amamiyakokoro/KokoroBox-Desktop.git
cd KokoroBox-Desktop
pnpm install
pnpm dev
pnpm typecheck
pnpm test:kokoro
pnpm test:localization
pnpm test:override-user-agent
pnpm test:app-routing
pnpm prepare
pnpm build:win # or build:mac / build:linux
```

Use `--x64` or `--arm64` to select an architecture. See the [release guide](docs/releases.md) for packaging, signing, and publishing.

### Linux system-core packages

Linux distributions can build KokoroBox without bundled cores or lifecycle scripts. Set
`KOKOROBOX_SYSTEM_CORE` to `1` for `/usr/bin/mihomo`, or to an absolute core path. The service
defaults to `/usr/bin/kokorobox-service` and can be overridden with an absolute
`KOKOROBOX_SYSTEM_SERVICE` path:

```bash
KOKOROBOX_SYSTEM_CORE=1 \
KOKOROBOX_SYSTEM_SERVICE=/usr/bin/kokorobox-service \
pnpm build:linux deb --x64
```

In this mode, distribution packages must provide the core and service independently. Legacy
`SPARKLE_SYSTEM_CORE` and `SPARKLE_SYSTEM_SERVICE` variables remain accepted only for existing
downstream package recipes.

## License

KokoroBox-Desktop is derived from [Sparkle](https://github.com/xishang0128/sparkle) and retains
compatible internal identifiers where required for upgrades. Application routing incorporates
MIT-licensed ProxyBridge components and platform networking dependencies listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Licensed under [GNU GPLv3](LICENSE). Third-party components remain subject to their respective licenses.
