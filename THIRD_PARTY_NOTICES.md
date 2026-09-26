# Third-party notices

KokoroBox includes the components below, each under its own license.
Repository links open tracked license files or explain build-generated notices.
Packaged notices are collected under `resources/licenses/` on Windows/Linux,
or `KokoroBox.app/Contents/Resources/licenses/` on macOS.

| Component                                                                   | Use                           | License                | Repository notice                               | Packaged file (inside `licenses/`)        |
| --------------------------------------------------------------------------- | ----------------------------- | ---------------------- | ----------------------------------------------- | ----------------------------------------- |
| [Sparkle](https://github.com/sparkle-project/Sparkle)                       | macOS updates                 | MIT                    | [License](licenses/LICENSE.Sparkle)             | `LICENSE.Sparkle` (macOS)                 |
| [ProxyBridge](https://github.com/amamiyakokoro/ProxyBridge)                 | Application routing           | MIT                    | [License](licenses/LICENSE.ProxyBridge)         | `LICENSE.ProxyBridge` (Windows/macOS)     |
| [WinDivert 2.2.2](https://github.com/basil00/WinDivert/releases/tag/v2.2.2) | Windows packet interception   | LGPL-3.0-only          | [License](licenses/LICENSE.WinDivert)           | `LICENSE.WinDivert` (Windows)             |
| [circle-flags](https://github.com/HatScripts/circle-flags)                  | Country flags                 | MIT                    | [License](licenses/LICENSE.circle-flags)        | `LICENSE.circle-flags`                    |
| [Cloudflare Speedtest](https://github.com/cloudflare/speedtest)             | Network measurements          | MIT                    | [License](licenses/LICENSE.CloudflareSpeedtest) | `LICENSE.CloudflareSpeedtest`             |
| [sysproxy-go](https://github.com/amamiyakokoro/sysproxy-go)                 | System proxy integration      | GPL-3.0                | [License](licenses/LICENSE.sysproxy-go)         | `LICENSE.sysproxy-go`                     |
| npm dependencies                                                            | Frontend and runtime packages | Various                | [Generated notices](licenses/README.md)         | `main.txt`, `renderer.txt`, `preload.txt` |
| Icon sets via react-icons                                                   | Application icons             | Various                | [Icon licenses](licenses/icons/)                | `icons/`                                  |
| [Twemoji Mozilla](https://github.com/mozilla/twemoji-colr)                  | Emoji font                    | Apache-2.0 / CC-BY-4.0 | [License](licenses/LICENSE.Twemoji)             | `LICENSE.Twemoji`                         |

Tracked native license backups are included for reference on all platforms;
build-supplied notices accompany the corresponding bundled native components.
Original license copies alongside native binaries and Electron/Chromium are retained.
KokoroBox does not package the upstream ProxyBridge GUI, updater, or DNS proxy provider.
