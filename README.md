<div align="center">

<img src="resources/icon.png" width="112" alt="KokoroBox icon">

# KokoroBox-Desktop

The desktop home of KokoroBox, a Mihomo client with native Kokoro subscription support.

</div>

## About

KokoroBox is an Electron-based desktop client for [Mihomo](https://github.com/MetaCubeX/mihomo). It combines profile management, system proxy controls, TUN support, configuration overrides, and authenticated Kokoro subscriptions in one application.

## Highlights

- **Mihomo integration** — bundled stable and preview cores with controls for commonly used settings
- **TUN and system proxy** — ready-to-use TUN mode and native system proxy integration
- **Kokoro integration** — secure account sign-in, authenticated subscription downloads, and automatic updates
- **Profile tools** — flexible configuration overrides and integrated Sub-Store subscription management
- **Backup and restore** — one-click configuration backup and restore through WebDAV
- **Desktop experience** — multiple color themes and a modern React interface
- **Localization** — English, Simplified Chinese and Traditional Chinese (Taiwan), with automatic system-language selection

Choose a language under **Application settings → Interface language**, then restart the app to apply it to every window and native menu. Subscription names, proxy names, and configuration contents retain their original text.

With **System default**, the first supported language in your system preferences is used. English variants such as `en-US` and `en-GB` use English; Chinese script and region variants select Simplified or Traditional Chinese. If no supported language is found, the existing Simplified Chinese fallback is retained.

## Kokoro subscriptions

KokoroBox can create and maintain Mihomo profiles directly from a Kokoro account:

- Secure osu! sign-in through the system browser
- Authenticated subscription downloads without exposing credentials in profile URLs
- Automatic subscription updates
- Kokoro account and subscription settings integrated into the desktop interface

For the mandatory PKCE S256 flow, callback handling and verification checklist, see the [client authentication guide](docs/kokoro-client-api.md).

Access tokens, refresh tokens, subscription credentials, and complete subscription URLs must never be included in logs, screenshots, analytics, or issue reports.

## Install

Download a package for your platform from [GitHub Releases](https://github.com/amamiyakokoro/KokoroBox-Desktop/releases):

- Windows: NSIS installer or portable 7z archive
- macOS: PKG installer
- Linux: DEB, RPM, or Pacman package

On macOS, use the PKG when testing proxy connections. It installs KokoroBox in `/Applications` and assigns the ownership and setuid permissions required by the bundled Mihomo cores. Running an intermediate `.app` from `dist/mac-*` skips these installation steps.

GitHub Actions currently produces unsigned Windows packages and unsigned, non-notarized macOS PKG installers. Local Apple-signed packages are separate from CI artifacts. See the [release workflow guide](docs/releases.md) for triggers, build targets, verification, and signing requirements.

Code pushes to `master` build all platforms and update the Rolling prerelease. Push a version tag or run the Release workflow manually to publish a stable release.

## Build from source

### Requirements

- Node.js 22.12 or later; an LTS release is recommended
- pnpm 11
- A recent Git release

Clone the repository and install its dependencies:

```bash
git clone https://github.com/amamiyakokoro/KokoroBox-Desktop.git
cd KokoroBox-Desktop
pnpm install
```

Start the development server:

```bash
pnpm dev
```

If Electron was not installed correctly, reinstall its binary before starting development:

```bash
cd node_modules/electron
node install.js
cd ../..
```

On Windows, disable TUN temporarily if the development window opens as a blank screen.

### Scripts

| Command                  | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `pnpm dev`               | Start the development server                                         |
| `pnpm typecheck`         | Type-check the main and renderer processes                           |
| `pnpm test:kokoro`       | Test Kokoro PKCE authentication and callback handling                |
| `pnpm test:localization` | Check locale selection, translation coverage and renderer startup    |
| `pnpm lint`              | Run ESLint and apply supported fixes                                 |
| `pnpm format`            | Format the repository with Prettier                                  |
| `pnpm prepare`           | Download and prepare cores, services, rule data, and frontend assets |
| `pnpm build:win`         | Build Windows packages                                               |
| `pnpm build:mac`         | Build the macOS PKG installer                                        |
| `pnpm build:linux`       | Build Linux packages                                                 |

Specify an architecture with the matching electron-builder flag. Prepare target resources before creating a release package:

```bash
pnpm prepare --arm64
pnpm build:mac --arm64
```

The packaging commands accept `--x64` and `--arm64` for each supported operating system.

### Linux system-core builds

For distribution packages that provide Mihomo and the privileged service separately, enable the system-core build mode:

```bash
export SPARKLE_SYSTEM_CORE=1
# Optional; defaults to /usr/bin/sparkle-service
export SPARKLE_SYSTEM_SERVICE=/usr/bin/sparkle-service
pnpm install
pnpm build:linux
```

`SPARKLE_SYSTEM_CORE=1` uses `/usr/bin/mihomo` by default. Set it to an absolute path to use another system-provided executable. The service path defaults to `/usr/bin/sparkle-service`.

This mode skips downloading and packaging external resources and removes the project's package installation hooks. Distribution subpackages must provide the runtime resources, while the init system manages the service lifecycle.

## Project structure

| Path           | Purpose                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------- |
| `src/main`     | Electron main process, Mihomo lifecycle, configuration, and operating-system integration |
| `src/preload`  | Secure renderer-to-main bridge                                                           |
| `src/renderer` | React application                                                                        |
| `src/shared`   | Types shared by the main and renderer processes                                          |
| `resources`    | Application assets                                                                       |
| `build`        | Packaging configuration and scripts                                                      |
| `extra`        | Prepared cores and runtime resources                                                     |
| `scripts`      | Resource preparation and release tools                                                   |

KokoroBox is built with Electron, React, TypeScript, HeroUI, Tailwind CSS, and Monaco Editor. Privileged operations use `sparkle-service`, while `sysproxy-go` provides system proxy integration.

## Contributing

This repository is primarily maintained for personal use. Bug reports and focused pull requests are reviewed on a case-by-case basis. Please use [GitHub Issues](https://github.com/amamiyakokoro/KokoroBox-Desktop/issues) for reproducible bugs and feature proposals.

Before opening a pull request:

1. Follow the existing code style and naming conventions.
2. Run `pnpm typecheck` and the relevant tests.
3. Update the documentation when behavior changes.
4. Restart the development server after changing main-process or preload code.

Never commit credentials, subscription URLs, generated user profiles, or local runtime data.

## Upstream and license

KokoroBox-Desktop is derived from the original [Sparkle project](https://github.com/xishang0128/sparkle) and continues to use compatible internal service and data identifiers where required for safe upgrades.

The project is distributed under the [GNU General Public License version 3](LICENSE). Individual dependencies remain subject to their respective licenses.
