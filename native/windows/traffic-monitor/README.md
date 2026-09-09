# KokoroBox TrafficMonitor plugin

This source-built plugin supplies TrafficMonitor with the upload and download rates reported by
Mihomo's `/traffic` endpoint. It replaces the binary-only `Sparkle.dll` that older KokoroBox
packages obtained indirectly from `xishang0128/sparkle-run`.

The plugin opens the named pipe provided through `KOKOROBOX_MIHOMO_PIPE`, falling back to
`\\.\pipe\KokoroBox\mihomo`, and keeps the streaming HTTP response on a background thread.
TrafficMonitor's UI thread only reads the latest atomic speed values, so a stopped or restarting
Mihomo core cannot freeze the taskbar.

Build on Windows with Visual Studio 2022 and CMake:

```powershell
./build.ps1 -TargetArch x64 -OutputDir ../../../extra/files/TrafficMonitor/plugins
```

Supported target names are `x64`, `arm64` (built as ARM64EC for the official TrafficMonitor
package), and `ia32`.
