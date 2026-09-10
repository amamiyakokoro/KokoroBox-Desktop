# Third-party notices

## KokoroBox Native

KokoroBox uses the independently maintained
[`kokorobox-native`](https://github.com/amamiyakokoro/kokorobox-native) package for privileged
execution, Windows user and firewall integration, application metadata, icons, and rule-file
conversion. Its repository retains the Git history and attribution of
[`UruhaLushia/sparkle-native`](https://github.com/UruhaLushia/sparkle-native), from which it was
derived, while using KokoroBox-owned package and binary names for future development.

KokoroBox Native is distributed under the GNU General Public License v3.0.

## ProxyBridge

KokoroBox uses a modified subset of the
[KokoroBox ProxyBridge fork](https://github.com/amamiyakokoro/ProxyBridge) as the
packet-interception core behind its Windows x64 native router and macOS app-proxy System
Extension. The build is pinned to commit
`c02b787ca4a5cc6f5b7c957fa17cee4170e54114`. The fork correlates WinDivert socket and flow
events with intercepted packets before evaluating process rules, and blocks unresolved owners
when KokoroBox enables fail-closed mode. It also raises the internal process-pattern capacity and
exposes the opt-in, per-application UDP/53 routing control used by KokoroBox application routing
without intercepting Windows DNS Client or changing system DNS. Its history retains the upstream
source and license.

On macOS, KokoroBox packages only the `NETransparentProxyProvider` backend with a controlled,
atomic Signing Identifier policy. The upstream ProxyBridge GUI, updater, and DNS proxy provider
are not enabled.

ProxyBridge is distributed under the MIT License. Copyright (c) 2025
Anof-cyber/InterceptSuite. The complete license is packaged next to the sidecar as
`LICENSE.ProxyBridge`.

## WinDivert

The Windows sidecar dynamically links to the unmodified WinDivert 2.2.2 runtime and uses the
LGPL-3.0-only licensing option. The official release archive and corresponding source are
available from [WinDivert releases](https://github.com/basil00/WinDivert/releases/tag/v2.2.2).
Its complete license is packaged next to the sidecar as `LICENSE.WinDivert`; recipients may
replace the dynamically linked library in accordance with that license.

## TrafficMonitor

The Windows taskbar traffic display packages the unmodified official TrafficMonitor V1.86 Lite
release from [zhongyang219/TrafficMonitor](https://github.com/zhongyang219/TrafficMonitor).
KokoroBox verifies the upstream release archive against the SHA-256 digest published by GitHub
before packaging it. TrafficMonitor is distributed under the Anti 996 License Version 1.0
(Draft); the complete license is packaged beside `TrafficMonitor.exe` as
`LICENSE.TrafficMonitor`.

KokoroBox does not package the binary-only `Sparkle.dll` previously obtained from
`xishang0128/sparkle-run`. Instead, `KokoroBoxTrafficPlugin.dll` is built from source in this
repository. It uses TrafficMonitor's MIT-licensed plugin interface and reads upload/download
rates directly from Mihomo's `/traffic` endpoint over KokoroBox's local named pipe. The plugin
SDK license is packaged as `LICENSE.TrafficMonitorPluginSDK`. The KokoroBox plugin itself is
covered by this repository's GNU GPLv3 license.
