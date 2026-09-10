# Native integration

KokoroBox Desktop uses [`kokorobox-native`](https://github.com/amamiyakokoro/kokorobox-native)
for operating-system behavior that should not be implemented by parsing shell
output or constructing privileged shell commands in Electron.

## Current boundary

| Area                      | Native API                                      | Desktop consumer                            |
| ------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Applications              | `inspectApplication`, `scanWindowsApplications` | Application routing and Windows rule groups |
| Icons and rules           | `fileToDataUrl`, `getAppName`, `fileToStr`      | UI metadata and rule conversion             |
| Login startup             | `getLaunchAtLogin`, `setLaunchAtLogin`          | Kokoro settings                             |
| Network state             | `getNetworkContext`                             | SSID switching and macOS DNS recovery       |
| Unix core permissions     | `getCorePrivilegeStatus`, `setCorePrivileges`   | Mihomo permission checks, grant, and revoke |
| Windows system operations | SID, elevation, and Firewall APIs               | Routing and privileged setup                |

The P0 migration consolidates active interface, macOS network-service, DNS, and
SSID discovery in Rust. Windows SSID lookup uses the Native Wi-Fi API rather
than localized command output. The Desktop process consumes one typed network
snapshot instead of maintaining independent platform parsers.

Core privilege changes are also constrained at the native boundary. Only
existing executable files whose canonical filename is `mihomo` or
`mihomo-alpha` are accepted. Linux no longer invokes `pkexec bash -c`; the
validated paths are passed directly to `chown` and `chmod`.

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
