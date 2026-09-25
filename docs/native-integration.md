# Native integration

KokoroBox Desktop uses [`kokorobox-native`](https://github.com/amamiyakokoro/kokorobox-native) for OS behavior instead of parsing shell output or constructing privileged commands in Electron.

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

Rust provides one typed snapshot for interface, macOS network-service, DNS, and SSID discovery. Windows SSID lookup uses the Native Wi-Fi API.

Launch-at-login now uses native platform registration. On macOS, the returned
status distinguishes an enabled item from one that still requires approval in
System Settings. Desktop keeps the switch off in that state and presents a
direct route to Login Items & Extensions instead of reporting a false success.

The native package handles macOS service registration, status, approval, reload, removal, and opening Login Items. Desktop still packages the LaunchDaemon plist and service binary.

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
token with `isRunningAsAdmin` and asks
`relaunchCurrentApplicationWithPrivilege` to restart the current executable at
the requested integrity level. The API does not accept an executable path and
does not recreate the removed elevation task or make an administrator launch
persistent.

Service lifecycle actions, fixed macOS service maintenance, and managed-file
permission repair each use a separate native API. Desktop has no arbitrary
elevated-command helper.

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
