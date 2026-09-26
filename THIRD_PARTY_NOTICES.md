# Third-party notices

KokoroBox includes the components below. Each component remains subject to its
own license; packaged builds include the referenced license files where noted.

| Component                                                                   | Use                                                                      | License                | Source / notice                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------ |
| [Sparkle](https://github.com/sparkle-project/Sparkle)                       | Native macOS application updates                                         | MIT                    | Packaged on macOS only.                                                              |
| [ProxyBridge](https://github.com/amamiyakokoro/ProxyBridge)                 | Windows and macOS application-routing backend                            | MIT                    | `LICENSE.ProxyBridge`                                                                |
| [WinDivert 2.2.2](https://github.com/basil00/WinDivert/releases/tag/v2.2.2) | Windows packet-interception runtime                                      | LGPL-3.0-only          | `LICENSE.WinDivert`                                                                  |
| [circle-flags](https://github.com/HatScripts/circle-flags)                  | Locally packaged country flag SVGs                                       | MIT                    | `licenses/LICENSE.circle-flags`; revision `379588b5da95482d6bbf10bd45644a35b0609ea6` |
| [Cloudflare Speedtest 1.14.1](https://github.com/cloudflare/speedtest)      | Network speed, latency, and jitter measurements                          | MIT                    | `LICENSE.CloudflareSpeedtest`                                                        |
| npm dependencies                                                            | Bundled frontend and runtime packages, including transitive dependencies | Various                | `licenses/main.txt`, `licenses/renderer.txt`, `licenses/preload.txt`                 |
| Icon sets via react-icons                                                   | Application icons                                                        | Various                | `licenses/supplemental/icons/`; package attribution in `licenses/renderer.txt`       |
| [Twemoji Mozilla](https://github.com/mozilla/twemoji-colr)                  | Emoji font                                                               | Apache-2.0 / CC-BY-4.0 | `licenses/supplemental/LICENSE.Twemoji`                                              |

KokoroBox does not package the upstream ProxyBridge GUI, updater, or DNS proxy
provider.
