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

Windows [System Proxy Diagnostics](system-proxy-diagnostics.md) use Native's
`getSystemProxyDiagnostics()` / `setSystemProxy()` for OS configuration and the
Service's `/core/proxy-diagnostics` for loaded ports and runtime health. Desktop
coordinates the two snapshots and presents sanitized results.

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

## Verified core process cleanup

Desktop records a direct core's PID, canonical executable and creation identity.
Native's `inspectCoreProcess` and `stopCoreProcess` verify Mihomo's executable and
user identity before stopping it. Linux uses pidfd (and fails closed on kernels
without it); Windows retains the verified process handle. macOS rechecks the
path and microsecond creation time before each signal, but has no pidfd and
cannot eliminate the final check-to-signal race.

Legacy PID-only records are adopted only after Native verifies the current
executable and owner. They cannot prove the original creation time. Older Native
binaries fail closed when asked to clean up a persisted process; a live Node
ChildProcess remains eligible for normal direct-mode shutdown. The new Native
APIs must be released before enabling persisted cleanup in packaged Desktop.

## Application-routing coordination

Native's `reconcileMacosApplicationRouting` serializes the fixed loopback SOCKS5
handshake, policy acknowledgement and provider health refresh. Only a running
response acknowledges a policy. Desktop retains the status refresh cadence and
UI approval guidance; older Native binaries retain the previous Desktop path.

Windows/Linux Service versions advertising `processRouterEvents` push status
snapshots at `/process-router/events`. Desktop sends a ping every five seconds
to renew the existing twenty-second client lease. Server snapshots do not renew
it. The Service Manager owns process/firewall reconciliation; older Service
versions retain Desktop status polling. Reconnection resubmits current intent.

## Mihomo profile validation

`validateCoreProfile` accepts an executable, config path, working directory and
trusted paths. Native runs only `-t -f <config> -d <work>` with a ten-second
deadline and bounded stdout/stderr. Results distinguish valid, invalid, timeout
and output-limit outcomes. Desktop retains localized error formatting.

Service versions advertising `coreProfileValidation` expose
`POST /core/profile/validate` with the same DTO. Service uses the active protected
executable when it matches the selected core, otherwise its existing binary
preparation path. Validation does not save launch intent or restart the core.
Older binaries use the centralized bounded Desktop compatibility path.

## Service process status compatibility

`getServiceProcessStatus` queries the platform Service manager first. When the
OS probe fails or reports unknown, Native runs only the validated KokoroBox
Service executable with `service status`, bounded to 2.5 seconds and bounded
output. Native parses recognized structured states and returns unknown for
malformed output. Desktop retains registration/approval and authentication
policy; its CLI parser is used only by older Native binaries.
