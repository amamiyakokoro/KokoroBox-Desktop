<div align="center">

<img src="images/kokorobox-readme.png" width="128" height="128" alt="KokoroBox">

# KokoroBox

A cross-platform [Mihomo](https://github.com/MetaCubeX/mihomo) desktop client with built-in Kokoro subscriptions.

[Download](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases) · [Privacy](PRIVACY_POLICY.md) · [License](LICENSE)

</div>

## Features

- Stable and preview Mihomo cores, system proxy, TUN, DNS, sniffing, routing, and profiles
- Kokoro subscriptions with osu! OAuth sign-in, custom rules, and automatic updates
- Per-application **Proxy**, **Direct**, and **Block** rules
- WebDAV backup and restore; English, Simplified Chinese, and Traditional Chinese UI

## Application routing

Route selected applications without enabling the system proxy or TUN. Proxy rules fail closed when Mihomo is unavailable, preventing a silent fallback to direct connections.

| Platform          | Backend                                        | Availability                    |
| ----------------- | ---------------------------------------------- | ------------------------------- |
| Windows 10/11 x64 | ProxyBridge + WinDivert                        | Supported                       |
| macOS 13+         | ProxyBridge transparent-proxy System Extension | Experimental; approval required |
| Linux x64/arm64   | cgroup v2, with cgroup v1 fallback; TPROXY     | Experimental; no TUN required   |

See the [Windows](docs/windows-app-routing.md), [macOS](docs/macos-app-routing.md), and [Linux](docs/linux-app-routing.md) guides for setup and limitations.

## Install

Download the appropriate package from [GitHub Releases](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases). Each release includes `SHA256SUMS`:

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing
```

Linux packages and `SHA256SUMS` are signed with the KokoroBox Linux package signing key. Verify
the included `kokorobox-linux-signing-key.asc` fingerprint before importing it:

```text
72B1 5D00 8F40 5210 5E23  8DD5 576C 2811 308E D996
```

```sh
gpg --show-keys --with-fingerprint kokorobox-linux-signing-key.asc
gpg --import kokorobox-linux-signing-key.asc
gpg --verify SHA256SUMS.asc SHA256SUMS
```

RPM signatures are embedded in the package. Debian packages include `.deb.asc`, Arch packages
include `.pkg.tar.zst.sig`, and the checksum manifest includes `SHA256SUMS.asc`.

Windows packages are currently unsigned. On macOS, use the DMG for normal installation: drag
KokoroBox to Applications, launch the installed copy, then follow the system-service and optional
application-routing approval prompts. The PKG is retained for recovery and managed deployment.

## Development

Requires Node.js 22.12+ and pnpm 11. Windows builds also need Go 1.23+; macOS application-routing builds need Xcode.

```sh
git clone https://github.com/amamiyakokoro/KokoroBox-Desktop.git
cd KokoroBox-Desktop
pnpm install
pnpm dev
```

Useful checks:

```sh
pnpm typecheck
pnpm test:release
pnpm test:app-routing
pnpm build:win # or build:mac / build:linux
```

For packaging, signing, Linux system-core builds, and release publication, see the [release guide](docs/releases.md). The [native integration guide](docs/native-integration.md) documents the Rust boundary and migration rules. UI text and translation contributions should follow the [localization guide](docs/localization.md).

## License

KokoroBox-Desktop is derived from [Sparkle](https://github.com/xishang0128/sparkle) and licensed under [GNU GPLv3](LICENSE). Third-party component notices and licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
