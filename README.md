<div align="center">

<img src="resources/icon.png" width="112" alt="KokoroBox icon">

# KokoroBox-Desktop

A cross-platform Mihomo desktop client with native Kokoro subscription support.

</div>

## Features

- Bundled stable and preview [Mihomo](https://github.com/MetaCubeX/mihomo) cores
- System proxy and TUN controls
- Secure Kokoro sign-in and authenticated subscription updates
- Profile overrides and integrated Sub-Store tools
- WebDAV backup and restore
- English, Simplified Chinese, and Traditional Chinese localization

## Kokoro subscriptions

KokoroBox signs in through osu! in the system browser and downloads Mihomo profiles using short-lived credentials. See the [Kokoro client authentication guide](docs/kokoro-client-api.md) for the PKCE S256 flow and callback contract.

Never include access tokens, refresh tokens, subscription credentials, or complete subscription URLs in logs or issue reports.

## Install

Download the latest package from [GitHub Releases](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases):

- Windows x64/ARM64: installer or portable archive
- macOS Intel/Apple Silicon: signed and notarized PKG
- Linux x64/ARM64: DEB, RPM, or Pacman package

The macOS PKG installs the permissions required by the bundled Mihomo core; running an intermediate `.app` from `dist` does not. Windows packages are not currently Authenticode-signed.

Each release includes `SHA256SUMS`:

```bash
shasum -a 256 -c SHA256SUMS --ignore-missing
```

## Build from source

Requirements:

- Node.js 22.12 or later
- pnpm 11
- Go 1.23 or later when preparing Windows packages

```bash
git clone https://github.com/amamiyakokoro/KokoroBox-Desktop.git
cd KokoroBox-Desktop
pnpm install
pnpm dev
```

Common commands:

| Command                  | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `pnpm typecheck`         | Type-check the main and renderer processes |
| `pnpm test:kokoro`       | Test Kokoro authentication and callbacks   |
| `pnpm test:localization` | Test localization coverage                 |
| `pnpm lint`              | Run ESLint and apply supported fixes       |
| `pnpm format`            | Format the repository                      |
| `pnpm prepare`           | Prepare cores and runtime resources        |
| `pnpm build:win`         | Build Windows packages                     |
| `pnpm build:mac`         | Build the macOS PKG                        |
| `pnpm build:linux`       | Build Linux packages                       |

Pass `--x64` or `--arm64` when targeting a specific architecture:

```bash
pnpm prepare --arm64
pnpm build:mac --arm64
```

See the [release workflow guide](docs/releases.md) for signing, build targets, and publication details.

## Contributing

Bug reports and focused pull requests are welcome through [GitHub Issues](https://github.com/amamiyakokoro/KokoroBox-Desktop/issues). Before submitting a change, run `pnpm typecheck` and the relevant tests. Do not commit credentials, subscription URLs, generated profiles, or local runtime data.

## License

KokoroBox-Desktop is derived from [Sparkle](https://github.com/xishang0128/sparkle) and retains compatible internal identifiers where required for upgrades.

Licensed under [GNU GPLv3](LICENSE). Third-party components remain subject to their respective licenses.
