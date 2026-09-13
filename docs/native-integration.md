# Native integration

KokoroBox Desktop uses [`kokorobox-native`](https://github.com/amamiyakokoro/kokorobox-native)
for operating-system behavior that should not be implemented by parsing shell
output or constructing privileged shell commands in Electron.

## Current boundary

| Area                      | Native API                                      | Desktop consumer                             |
| ------------------------- | ----------------------------------------------- | -------------------------------------------- |
| Applications              | `inspectApplication`, `scanWindowsApplications` | Application routing and Windows rule groups  |
| Icons and rules           | `fileToDataUrl`, `getAppName`, `fileToStr`      | UI metadata and rule conversion              |
| Login startup             | `getLaunchAtLogin`, `setLaunchAtLogin`          | Kokoro settings and macOS approval guidance  |
| Network state             | `getNetworkContext`                             | SSID switching and macOS DNS recovery        |
| macOS system service      | managed-service lifecycle APIs                  | Bundled LaunchDaemon registration and repair |
| Executable discovery      | `findExecutables`                               | System Mihomo core selection                 |
| Unix core permissions     | `getCorePrivilegeStatus`, `setCorePrivileges`   | Mihomo permission checks, grant, and revoke  |
| Windows system operations | SID, explicit privilege relaunch, Firewall APIs | Routing and privileged setup                 |

The P0 migration consolidates active interface, macOS network-service, DNS, and
SSID discovery in Rust. Windows SSID lookup uses the Native Wi-Fi API rather
than localized command output. The Desktop process consumes one typed network
snapshot instead of maintaining independent platform parsers.

Launch-at-login now uses native platform registration. On macOS, the returned
status distinguishes an enabled item from one that still requires approval in
System Settings. Desktop keeps the switch off in that state and presents a
direct route to Login Items & Extensions instead of reporting a false success.

The P1 migration removes Desktop's separately compiled Objective-C service
bridge. Registration, status, approval detection, reload, removal, and opening
Login Items now come from the versioned native package. The LaunchDaemon plist
and the service binary remain application-owned packaging assets.

System core discovery also runs behind the native boundary. Desktop no longer
spawns `which`, `where.exe`, Homebrew, dpkg, rpm, pacman, or Scoop merely to
find Mihomo. The native API searches validated directories asynchronously,
checks platform executability rules, canonicalizes results, and deduplicates
aliases before returning them.

Core privilege changes are also constrained at the native boundary. Only
existing executable files whose canonical filename is `mihomo` or
`mihomo-alpha` are accepted. Linux no longer invokes `pkexec bash -c`; the
validated paths are passed directly to `chown` and `chmod`.

Windows privilege state remains process-scoped. Desktop checks the current
token with `isRunningAsAdmin`, uses `launchElevated` for an explicit UAC-backed
restart, and uses `launchUnelevated` to return to the interactive desktop user's
token. These operations do not recreate the removed elevation task or make an
administrator launch persistent.

## Adding another native function

1. Implement and test platform behavior in the root Rust crate.
2. Expose only typed inputs through the N-API crate; avoid arbitrary commands,
   registry paths, or filesystem mutation primitives.
3. Update `NativeCapabilities`, `napi/index.d.ts`, and the JavaScript loader.
4. Document failure behavior and unsupported platforms.
5. Publish the native package before updating the Desktop dependency.

Keep application policy and UI state in Desktop. Move functionality into the
native package when it represents a reusable, security-sensitive, or
platform-specific OS operation.
