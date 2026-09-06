# macOS application routing spike

KokoroBox reuses its existing **Application routing** UI and canonical rule order on macOS. The
macOS backend targets macOS 13 or later on Apple Silicon and Intel Macs; it does not change the
minimum OS version of unrelated KokoroBox features.

## Architecture

The Electron main process communicates with the bundled
`kokorobox-app-routing-bridge` executable using one versioned JSON request and response per
invocation. The Swift bridge is the only component that calls `OSSystemExtensionRequest` and
`NETransparentProxyManager`. It installs and controls
`com.amamiyakokoro.app.proxy-extension`, a KokoroBox-specific build of ProxyBridge's
`NETransparentProxyProvider`.

The bridge rejects calls unless its direct parent satisfies the Developer ID requirement for
`com.amamiyakokoro.app` and Team `755TNLRN92`. This prevents another local process from using
the bundled executable as a privileged network-configuration deputy. The Team ID is public
signing metadata, not a credential.

The extension receives the complete policy atomically. A rule uses
`sourceAppSigningIdentifier` as its stable identity; the selected `.app` path is retained only
for display and icon caching. A rule can use an exact identifier such as `com.openai.chat` or a
bounded wildcard such as `com.openai.chat*`. A global `*` rule is rejected.

Proxy traffic is sent only to the dedicated Mihomo SOCKS5 listener at `127.0.0.1:7891`. The
provider permanently leaves KokoroBox, its extension and helpers, Mihomo, loopback, link-local,
multicast, and broadcast traffic Direct. If Mihomo is unavailable, every enabled Proxy rule is
sent to the provider as Block. No fallback to Direct is implemented.

The DNS proxy provider and the upstream ProxyBridge SwiftUI application are not packaged.
Ordinary UDP/53, QUIC, DoH, and DoT traffic follows the selected application's TCP/UDP rule.

## Source and build

`scripts/prepare-macos-routing.ts` checks out the exact ProxyBridge fork revision declared in
`src/main/app-routing/integrity-manifest.ts`, builds the app-proxy System Extension, builds the
Swift bridge for the requested architecture, and stages both for electron-builder. For local
development, an already checked-out fork can be used without network access:

```bash
PROXYBRIDGE_SOURCE_DIR=/path/to/ProxyBridge npm_config_target_arch=arm64 \
  pnpm prepare:macos-routing
```

The generated payload is intentionally unsigned. Release packaging signs it inside the isolated
temporary Keychain immediately before electron-builder signs the containing app.

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

Signing order is enforced by `scripts/macos-after-pack.cjs`: embed the Extension profile, sign
the bridge, sign the System Extension, sign the Electron app, then sign the PKG. The existing
notarization, stapling, Gatekeeper, and checksum receipt checks remain mandatory.

## Verification status

Automated checks cover identifier validation, Windows schema migration, ordered policy
translation, fail-closed Proxy conversion, entitlement/build configuration, Swift compilation,
and unsigned arm64 payload creation. Actual activation and packet routing require the approved
Apple capabilities, matching provisioning profiles, a signed PKG, and a physical Mac.

Before merging this spike for release, verify on both Apple Silicon and Intel hardware:

- first-run approval and opening the correct System Settings pane;
- exact and wildcard Signing Identifier matching;
- TCP, UDP, QUIC, and UDP/53 routing;
- Proxy/Direct/Block behavior and no Mihomo loop;
- no Direct leak during Mihomo failure or atomic rule replacement;
- sleep/wake, network changes, extension replacement, app upgrade, and uninstall cleanup;
- successful Developer ID verification, notarization, stapling, and Gatekeeper assessment.
