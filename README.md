<div align="center">

<img src="images/kokorobox-readme.png" width="128" height="128" alt="KokoroBox">

# KokoroBox

A cross-platform [Mihomo](https://github.com/MetaCubeX/mihomo) desktop client with Kokoro subscriptions.

[Download](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases) · [Privacy](PRIVACY_POLICY.md) · [License](LICENSE)

</div>

## Features

- Overview of network, subscription, service health, and recent traffic, with optional custom backgrounds
- Mihomo profiles, system proxy, TUN, DNS, and sniffing
- Kokoro account and subscriptions with osu! sign-in, custom rules, and automatic refresh
- Per-application **Proxy**, **Direct**, and **Block** rules
- Searchable settings, WebDAV backup, and English, Simplified Chinese, and Traditional Chinese interfaces

## Application routing

Application routing supports Windows 10/11 x64, macOS 13+, and Linux x64/arm64. See the
[Windows](docs/windows-app-routing.md), [macOS](docs/macos-app-routing.md), and
[Linux](docs/linux-app-routing.md) guides for setup requirements.

## Install and update

Get the Windows installer (x64/ARM64), macOS DMG (Intel/Apple Silicon), or Linux package
(x64/ARM64) from [GitHub Releases](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases).
On macOS, drag KokoroBox into Applications. Windows installers are currently unsigned.

Choose **Stable** or **Rolling** in Application settings. macOS and Windows update in the app;
Linux updates through the system package manager. See the [macOS update guide](docs/macos-updates.md)
and [release guide](docs/releases.md) for details.

## Development

Requires Node.js 22.12+ and pnpm 11.

```sh
pnpm install
pnpm dev
```

Build and packaging instructions are in the [release guide](docs/releases.md).

## License

KokoroBox-Desktop is derived from [Sparkle](https://github.com/xishang0128/sparkle) and licensed under [GNU GPLv3](LICENSE). Third-party component notices and licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
