# macOS application routing

KokoroBox reuses its existing **Application routing** UI and canonical rule order on macOS. The
macOS backend targets macOS 13 or later on Apple Silicon and Intel Macs; it does not change the
minimum OS version of unrelated KokoroBox features.

## Architecture

The Electron main process loads the bundled `kokorobox-app-routing.node` Node-API module. The
module runs Apple API work asynchronously inside the already entitled and provisioned main app
process. It is the only component that calls `OSSystemExtensionRequest` and
`NETransparentProxyManager`, and it installs and controls
`com.amamiyakokoro.app.proxy-extension`, a KokoroBox-specific build of ProxyBridge's
`NETransparentProxyProvider`.

The module is not a standalone executable and carries no restricted entitlement or embedded
provisioning profile of its own. Apple authorizes the hosting `com.amamiyakokoro.app` process
using the main app's provisioning profile. This avoids an invalid standalone-helper design while
keeping the System Extension in its separately provisioned bundle.

The extension receives the complete policy atomically. Every rule has an explicit identity kind:

- **Signing identifier** compares against `sourceAppSigningIdentifier`. This is the stable,
  security-oriented default created by the application picker. The selected `.app` path is
  retained only for display and icon caching. Exact identifiers such as `com.openai.chat` and
  bounded wildcards such as `com.openai.chat*` are supported.
- **Process name** resolves the source PID from `sourceAppAuditToken`, reads its executable path,
  and compares the final path component. It supports command-line applications such as `codex`
  and bounded wildcards such as `Codex Helper*`.

The policy carries the identity kind to the extension, so signing identifiers and process names
are never matched ambiguously. A global `*` rule is rejected. Legacy pathless, single-component
macOS rules are migrated once to process-name rules; rules created with the application picker
remain signing-identifier rules.

Proxy traffic is sent only to the dedicated Mihomo SOCKS5 listener at `127.0.0.1:7891`. The
provider permanently leaves KokoroBox, its extension and helpers, Mihomo, loopback, link-local,
multicast, and broadcast traffic Direct. If Mihomo is unavailable, every enabled Proxy rule is
sent to the provider as Block. No fallback to Direct is implemented.

The DNS proxy provider and the upstream ProxyBridge SwiftUI application are not packaged.
Ordinary UDP/53, QUIC, DoH, and DoT traffic follows the selected application's TCP/UDP rule.

## Source and build

`scripts/prepare-macos-routing.ts` checks out the exact ProxyBridge fork revision declared in
`src/main/app-routing/integrity-manifest.ts`, builds the app-proxy System Extension, builds the
Node-API module against the matching Electron headers, and stages both for electron-builder. For
local development, an already checked-out fork can be used without network access:

```bash
PROXYBRIDGE_SOURCE_DIR=/path/to/ProxyBridge npm_config_target_arch=arm64 \
  pnpm prepare:macos-routing
```

The generated payload is intentionally unsigned. Release packaging signs the native module as
nested code and embeds the Extension profile before signing the containing app.

## Apple configuration

The Apple Developer account must have these identifiers and capabilities enabled:

- App ID: `com.amamiyakokoro.app`
- System Extension App ID: `com.amamiyakokoro.app.proxy-extension`
- App Group: `group.com.amamiyakokoro.app`
- Main app: Network Extensions (`app-proxy-provider-systemextension`) and System Extension
  installation
- Extension: Network Extensions (`app-proxy-provider-systemextension`)

Create Developer ID provisioning profiles for both App IDs. Add their Base64-encoded contents as
GitHub Secrets named `MACOS_APP_PROVISIONING_PROFILE` and
`MACOS_EXTENSION_PROVISIONING_PROFILE`. Provisioning profiles contain no private key, but they
are kept out of the repository and temporary files are deleted after signing.

Only these two provisioning profiles are required. No third bridge profile exists. Signing order
is enforced by `scripts/macos-after-pack.cjs` and electron-builder: embed the Extension profile,
sign the System Extension, sign the Node-API module as ordinary nested code, sign the Electron
app with its main-app profile, then build the PKG and DMG. The existing notarization, stapling,
Gatekeeper, and checksum receipt checks remain mandatory for both installers.

## Verification status

Automated checks cover typed identity validation and migration, Windows schema migration,
ordered policy translation, fail-closed Proxy conversion, entitlement/build configuration,
Node-API compilation, and unsigned arm64 payload creation. Actual activation and packet routing
require the approved Apple capabilities, matching provisioning profiles, a signed installer, and a
physical Mac.

Before merging this spike for release, verify on both Apple Silicon and Intel hardware:

- first-run approval and opening the correct System Settings pane;
- exact and wildcard signing-identifier and process-name matching;
- TCP, UDP, QUIC, and UDP/53 routing;
- Proxy/Direct/Block behavior and no Mihomo loop;
- no Direct leak during Mihomo failure or atomic rule replacement;
- sleep/wake, network changes, extension replacement, app upgrade, and uninstall cleanup;
- successful Developer ID verification, notarization, stapling, and Gatekeeper assessment.
