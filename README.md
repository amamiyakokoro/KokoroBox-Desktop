<div align="center">

<img src="images/kokorobox-readme.png" width="128" height="128" alt="KokoroBox">

# KokoroBox

A cross-platform [Mihomo](https://github.com/MetaCubeX/mihomo) desktop client with Kokoro subscriptions.

[Privacy](PRIVACY_POLICY.md) · [License](LICENSE)

</div>

## Features

- Overview of network, subscription, service health, and recent traffic, with optional custom backgrounds
- Mihomo profiles, system proxy, TUN, DNS, and sniffing
- Kokoro account and subscriptions with osu! sign-in, custom rules, and automatic refresh
- Per-application **Proxy**, **Direct**, and **Block** rules
- Searchable settings and WebDAV backup

## Supported platforms

KokoroBox is available for Windows, macOS, and Linux. Application routing supports Windows 10/11 x64, macOS 13+, and Linux x64/arm64; see the platform guides below for setup requirements.

## Get started

Download KokoroBox for Windows, macOS, or Linux from [GitHub Releases](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases).

## Development

Requires Node.js 22.12+ and pnpm 11.

```sh
pnpm install
pnpm dev
```

## Documentation

- [Release, update, and verification guide](docs/releases.md)
- Application routing: [Windows](docs/windows-app-routing.md), [macOS](docs/macos-app-routing.md), [Linux](docs/linux-app-routing.md)
- [Privacy policy](PRIVACY_POLICY.md)

## License

KokoroBox-Desktop is derived from [Sparkle](https://github.com/xishang0128/sparkle) and licensed under [GNU GPLv3](LICENSE). Third-party component notices and licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
