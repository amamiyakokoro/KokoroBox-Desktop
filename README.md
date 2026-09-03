# Kokoro

<h3 align="center">A desktop Mihomo client with native Kokoro subscription support</h3>

<p align="center">
  <a href="https://github.com/amamiyakokoro/KokoroApp/releases/latest"><img src="https://img.shields.io/github/v/release/amamiyakokoro/KokoroApp?label=latest" alt="Latest release"></a>
  <a href="https://github.com/amamiyakokoro/KokoroApp/releases/tag/rolling"><img src="https://img.shields.io/badge/release-rolling-orange" alt="Rolling release"></a>
  <a href="https://t.me/+y7rcYjEKIiI1NzZl"><img src="https://img.shields.io/badge/Telegram-Group-blue?logo=telegram" alt="Telegram group"></a>
</p>

Kokoro is an Electron-based desktop client for [Mihomo](https://github.com/MetaCubeX/mihomo). It combines profile management, system proxy controls, TUN support, configuration overrides, and authenticated Kokoro subscriptions in one application.

## Features

- Ready-to-use TUN mode without requiring service mode
- Secure Kokoro sign-in through the system browser and osu! OAuth
- Authenticated Kokoro subscription download and automatic updates
- Multiple color themes and a modern desktop interface
- Controls for commonly used Mihomo settings
- Bundled stable and preview Mihomo cores
- One-click configuration backup and restore through WebDAV
- Flexible configuration overrides
- Integrated Sub-Store subscription management

## Requirements

- Node.js 20 or later; an LTS release is recommended
- pnpm 9 or later
- A recent Git release

## Technology

Kokoro is built with Electron, React, and TypeScript.

### Renderer

- React 19
- TypeScript
- HeroUI
- Tailwind CSS
- Monaco Editor

### Main process

- Electron
- Mihomo Core
- `sparkle-service` for privileged operations
- `sysproxy-go` for system proxy integration

## Getting started

1. Clone the repository:

   ```bash
   git clone https://github.com/amamiyakokoro/KokoroApp.git
   cd KokoroApp
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Start the development server:

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

## Project structure

```text
KokoroApp/
├── src/
│   ├── main/               # Electron main process
│   │   ├── core/           # Mihomo lifecycle and API integration
│   │   ├── config/         # Application and profile configuration
│   │   ├── kokoro/         # Kokoro authentication and subscriptions
│   │   ├── resolve/        # Deep links, menus, tray, and updates
│   │   ├── service/        # Privileged service integration
│   │   ├── sys/            # Operating-system integration
│   │   └── utils/          # Shared main-process utilities
│   ├── preload/            # Secure renderer-to-main bridge
│   ├── renderer/           # React application
│   └── shared/             # Shared types
├── resources/              # Application assets
├── build/                  # Packaging configuration and scripts
├── extra/                  # Prepared cores and runtime resources
├── scripts/                # Resource preparation and release tools
├── electron-builder.yml    # electron-builder configuration
└── package.json
```

## Scripts

### Development

- `pnpm dev` — start the development server
- `pnpm typecheck` — type-check the main and renderer processes
- `pnpm typecheck:node` — type-check the main process
- `pnpm typecheck:web` — type-check the renderer
- `pnpm lint` — run ESLint and apply supported fixes
- `pnpm format` — format the repository with Prettier

### Resource preparation

- `pnpm prepare` — download and prepare cores, services, rule data, and frontend assets
- `pnpm postinstall` — install Electron and rebuild native application dependencies

### Packaging

- `pnpm build:win` — build Windows installers
- `pnpm build:mac` — build the macOS PKG installer
- `pnpm build:linux` — build Linux packages

Specify an architecture by passing the matching electron-builder flag:

```bash
pnpm build:win --x64
pnpm build:win --arm64
pnpm build:mac --x64
pnpm build:mac --arm64
pnpm build:linux --x64
pnpm build:linux --arm64
```

Prepare resources for the target architecture before creating a release package:

```bash
pnpm prepare --arm64
pnpm build:mac --arm64
```

Expected package formats:

- Windows: NSIS installer and portable 7z archive
- macOS: PKG installer
- Linux: DEB, RPM, and Pacman packages

### macOS installation note

Use the generated PKG when testing proxy connections. The PKG installs Kokoro in `/Applications` and runs the packaging scripts that assign the required owner and setuid permissions to the bundled Mihomo cores. Running the intermediate `.app` from `dist/mac-*` skips those installation steps.

The project currently creates non-notarized builds. Distribution outside a development environment requires an appropriate Apple signing and notarization setup.

## Kokoro authentication

Kokoro opens the system browser for osu! authorization and returns to the application through:

```text
kokoro://oauth/callback
```

The redirect URI must exactly match an entry in the server's `APP_REDIRECT_URIS` configuration. Access and refresh tokens are stored with Electron's secure storage and must never be written to logs, analytics, or crash reports.

## Contributing

This repository is primarily maintained for personal use. Pull requests are reviewed on a case-by-case basis.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-change`.
3. Run `pnpm typecheck` and the relevant tests.
4. Commit and push your changes.
5. Open a pull request with a concise description and verification notes.

When contributing:

- Follow the existing code style and naming conventions.
- Update documentation when behavior changes.
- Restart the development server after changing main-process or preload code.
- Never commit credentials, subscription URLs, generated user profiles, or local runtime data.

## Upstream

Kokoro is based on the original [Sparkle project](https://github.com/xishang0128/sparkle) and continues to use compatible internal service and data identifiers where required for safe upgrades.
