<div align="center">

<img src="resources/icon.png" width="112" alt="KokoroBox icon">

# KokoroBox-Desktop

A cross-platform Mihomo desktop client with built-in Kokoro subscriptions.

[Download](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases) · [Build](#development) · [License](LICENSE)

</div>

## Highlights

- Bundled stable and preview [Mihomo](https://github.com/MetaCubeX/mihomo) cores
- System proxy, TUN, DNS, sniffing, routing, and profile controls
- Secure osu! OAuth sign-in for Kokoro subscriptions
- Kokoro subscription options and editable `default` custom rules
- Profile overrides and automatic subscription updates
- WebDAV backup and restore
- English, Simplified Chinese, and Traditional Chinese localization

## Kokoro

Open **Kokoro Settings** from the sidebar, sign in through osu! in the system browser, choose the subscription options, then select **Get and add**. The Kokoro shortcut is also the first item in the subscription page's **+** menu.

After sign-in, the same page can edit the Kokoro `default` custom rule set. Authentication uses PKCE S256 and system-protected credential storage; see the [client API guide](docs/kokoro-client-api.md).

> Never include tokens, credentials, generated profiles, or complete subscription URLs in logs and issue reports.

## Install

Download a package for Windows, macOS, or Linux from [GitHub Releases](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases). Releases include `SHA256SUMS` for verification:

```bash
shasum -a 256 -c SHA256SUMS --ignore-missing
```

Windows packages are currently unsigned. On macOS, install the PKG so the bundled Mihomo core receives the required permissions.

## Development

Requires Node.js 22.12+, pnpm 11, and Go 1.23+ when preparing Windows packages.

```bash
git clone https://github.com/amamiyakokoro/KokoroBox-Desktop.git
cd KokoroBox-Desktop
pnpm install
pnpm dev
pnpm typecheck
pnpm test:kokoro
pnpm test:localization
pnpm prepare
pnpm build:win # or build:mac / build:linux
```

Use `--x64` or `--arm64` to select an architecture. See the [release guide](docs/releases.md) for packaging, signing, and publishing.

## License

KokoroBox-Desktop is derived from [Sparkle](https://github.com/xishang0128/sparkle) and retains compatible internal identifiers where required for upgrades.

Licensed under [GNU GPLv3](LICENSE). Third-party components remain subject to their respective licenses.
