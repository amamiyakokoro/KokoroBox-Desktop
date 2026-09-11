# macOS application updates

KokoroBox uses Sparkle 2 for application updates on macOS. The goal is the familiar native flow:
check for an update, review release notes, download in the background, then install and relaunch.
Windows and Linux keep their existing update implementations.

## Distribution model

The migration deliberately separates first installation from subsequent updates:

- The signed and notarized PKG remains the supported first-install and recovery package.
- A signed archive containing only `KokoroBox.app` is the Sparkle update payload.
- An appcast is the authenticated update index. Stable and rolling channels use separate feeds.
- The existing `latest.yml` remains available during migration and for non-macOS clients.

The application archive must contain the same Developer ID-signed app bundle that was placed in
the PKG. Both the archive and appcast are signed with Sparkle EdDSA keys. Apple code signing,
notarization and Sparkle signatures are independent checks; none replaces another.

## Native updater boundary

The Electron main process owns update policy and exposes only bounded IPC operations to the
renderer. A small macOS Node-API bridge owns `SPUStandardUpdaterController` on the AppKit main
thread. The renderer can request the standard Sparkle update window but cannot provide a feed URL,
public key, local package path or command to execute.

The feed URL and public key are embedded in the signed application. Runtime GitHub tokens are not
forwarded to Sparkle. Stable release assets and appcasts therefore need to remain publicly
downloadable.

## System extension lifecycle

The Network Extension remains embedded at
`Contents/Library/SystemExtensions/com.amamiyakokoro.app.proxy-extension.systemextension` and is
signed before the containing application. After an application update, the existing application
routing reconciliation submits `OSSystemExtensionRequest`. Its replacement delegate accepts a
newer extension with the same team and bundle identifiers.

An update must not deactivate the working extension before the replacement application has been
installed. If macOS requires approval or a reboot, the application reports that state without
falling back protected Proxy rules to Direct.

## Privileged components

Regular Sparkle app-bundle updates cannot reproduce arbitrary PKG scripts. Two legacy installer
responsibilities must therefore be removed before Sparkle becomes the only macOS update path:

1. Bundled Mihomo executables must no longer depend on installer-applied setuid bits. Privileged
   core and TUN operations move behind the authenticated KokoroBox Service boundary.
2. A registered service must execute from a stable, root-owned runtime outside the replaceable app
   bundle. The application installs or repairs that runtime only after an explicit authorization.

Until both conditions are satisfied, macOS continues using the PKG updater by default. Sparkle is
built and validated in parallel but is not enabled for existing users.

The privileged-runtime migration is implemented. Installing or repairing KokoroBox Service now
requests administrator authorization and copies the signed helper to
`/Library/PrivilegedHelperTools/com.amamiyakokoro.kokorobox-service` as `root:wheel` with mode
`0755`. Launchd is then registered from that stable path instead of the application bundle. Normal
application launches and service IPC do not request elevation. Uninstalling the service also
removes the stable runtime; authentication material remains in the user's protected application
data unless the user removes that data separately.

The application verifies both the helper SHA-256 and the executable path recorded by launchd. A
missing or stale runtime is repaired from the signed application bundle after macOS authorization.
The transition PKG also stages this helper and migrates an existing service registration while
preserving whether the service was running. It does not register a service for users who had not
installed one.

Bundled Mihomo executables are ordinary mode `0755` files; the PKG no longer grants them setuid
permission. Direct mode remains available for an unprivileged non-TUN core. Enabling TUN on macOS
selects the authenticated service mode, installs or repairs the service if required, initializes
its per-user authentication, and then launches Mihomo through that boundary. If authorization is
cancelled or the service remains unavailable, KokoroBox preserves service mode and reports the
failure instead of silently running a privileged configuration without its required boundary.

## Release pipeline

The staged release sequence is:

1. Build and sign the app and embedded System Extension once per architecture.
2. Build the PKG from that exact app bundle.
3. Notarize and staple the PKG and application update archive as required.
4. Sign the update archive with Sparkle EdDSA.
5. Generate a channel-specific appcast containing the exact version, bundle version, architecture,
   size, URL and signature.
6. Stage the PKG, update archive, appcast and verification receipts together. Publication remains
   fail-closed if any expected artifact is missing or no longer matches its receipt.

The Sparkle private key is a release secret and is never written to the repository or application.
The public key is injected into the application before code signing. Build jobs without release
credentials compile the bridge but cannot produce a publishable update archive or appcast.

## Migration stages

1. **Foundation:** document invariants, pin Sparkle source and verify its checksum.
2. **Native integration:** build and sign the updater bridge and framework, with Sparkle disabled.
3. **Parallel publication:** publish archives and appcasts while the in-app updater still uses PKG.
4. **Transition release:** ship Sparkle in a PKG so every upgraded installation has the new updater.
5. **Bundle updates:** switch macOS update actions to Sparkle after privileged runtime migration.
6. **Cleanup:** remove the macOS PKG auto-install code; retain PKG only for first install and repair.

The foundation, native-integration and privileged-runtime stages are implemented. Release builds
now compile and sign the updater bridge and embedded Sparkle framework, but the application
deliberately does not start Sparkle yet. `SUFeedURL` and `SUPublicEDKey` will only be injected once
parallel appcast publication and the transition upgrade path are verified.

## Rollback

The PKG remains a recovery path throughout the migration. If a feed or native bridge fails,
KokoroBox opens the matching GitHub release instead of executing a downloaded file. A bad Sparkle
release is superseded by a newer signed appcast item; published artifacts and tags are never
overwritten.

## Required validation

- Intel and Apple Silicon upgrades from the last PKG-only release.
- Stable and rolling channel separation and downgrade rejection.
- Interrupted download, invalid EdDSA signature and mismatched Developer ID rejection.
- App replacement while the service, Mihomo and Network Extension are active.
- System Extension replacement, approval-required and reboot-required paths.
- Update from a standard user account with KokoroBox installed in `/Applications`.
- Relaunch, login startup, proxy restoration and fail-closed application routing after update.

References:

- [Sparkle documentation](https://sparkle-project.org/documentation/)
- [Sparkle package update tradeoffs](https://sparkle-project.org/documentation/package-updates/)
- [Apple System Extension replacement delegate](<https://developer.apple.com/documentation/systemextensions/ossystemextensionrequestdelegate/request(_:actionforreplacingextension:withextension:)>)
