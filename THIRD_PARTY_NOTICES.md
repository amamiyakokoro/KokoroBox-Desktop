# Third-party notices

KokoroBox includes the components below. Each component remains subject to its
own license; packaged builds include the referenced license files where noted.

| Component                                                                   | Use                                                   | License       | Source / notice                                                                                                       |
| --------------------------------------------------------------------------- | ----------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| [KokoroBox Native](https://github.com/amamiyakokoro/kokorobox-native)       | Native platform APIs, application metadata, and icons | GPL-3.0       | Derived from [Sparkle Native](https://github.com/UruhaLushia/sparkle-native); attribution remains in its Git history. |
| [Sparkle](https://github.com/sparkle-project/Sparkle)                       | Native macOS application updates                      | MIT           | Packaged on macOS only.                                                                                               |
| [ProxyBridge](https://github.com/amamiyakokoro/ProxyBridge)                 | Windows and macOS application-routing backend         | MIT           | `LICENSE.ProxyBridge`                                                                                                 |
| [WinDivert 2.2.2](https://github.com/basil00/WinDivert/releases/tag/v2.2.2) | Windows packet-interception runtime                   | LGPL-3.0-only | `LICENSE.WinDivert`                                                                                                   |
| [circle-flags](https://github.com/HatScripts/circle-flags)                  | Locally packaged country flag SVGs                    | MIT           | `src/renderer/src/assets/circle-flags/LICENSE.md`; revision `379588b5da95482d6bbf10bd45644a35b0609ea6`                |

KokoroBox does not package the upstream ProxyBridge GUI, updater, or DNS proxy
provider.

## Cloudflare Speedtest

KokoroBox bundles [`@cloudflare/speedtest`](https://github.com/cloudflare/speedtest)
(version 1.14.1) for the Overview network card's download, upload, latency, and
jitter measurements against [Cloudflare Speed Test](https://speed.cloudflare.com/).
The component is licensed under the MIT License. Its copyright and license notice
are reproduced below from the distributed package's `LICENSE` file.

```text
MIT License

Copyright (c) 2023 Cloudflare

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
