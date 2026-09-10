# Third-party notices

KokoroBox includes the components below. Each component remains subject to its
own license; packaged builds include the referenced license files where noted.

| Component                                                                   | Use                                                   | License                      | Source / notice                                                                                                       |
| --------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [KokoroBox Native](https://github.com/amamiyakokoro/kokorobox-native)       | Native platform APIs, application metadata, and icons | GPL-3.0                      | Derived from [Sparkle Native](https://github.com/UruhaLushia/sparkle-native); attribution remains in its Git history. |
| [ProxyBridge](https://github.com/amamiyakokoro/ProxyBridge)                 | Windows and macOS application-routing backend         | MIT                          | `LICENSE.ProxyBridge`                                                                                                 |
| [WinDivert 2.2.2](https://github.com/basil00/WinDivert/releases/tag/v2.2.2) | Windows packet-interception runtime                   | LGPL-3.0-only                | `LICENSE.WinDivert`                                                                                                   |
| [TrafficMonitor V1.86 Lite](https://github.com/zhongyang219/TrafficMonitor) | Windows taskbar traffic display                       | Anti 996 License 1.0 (Draft) | `LICENSE.TrafficMonitor`                                                                                              |
| TrafficMonitor plugin SDK                                                   | Interface used by `KokoroBoxTrafficPlugin.dll`        | MIT                          | `LICENSE.TrafficMonitorPluginSDK`                                                                                     |

`KokoroBoxTrafficPlugin.dll` is built from source in this repository and is
licensed under GPLv3. KokoroBox does not package `Sparkle.dll`, the upstream
ProxyBridge GUI, updater, or DNS proxy provider.
