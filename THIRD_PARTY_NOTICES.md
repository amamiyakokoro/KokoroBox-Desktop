# Third-party notices

## ProxyBridge

KokoroBox uses a modified subset of the
[KokoroBox ProxyBridge fork](https://github.com/amamiyakokoro/ProxyBridge) as the
packet-interception core behind its Windows x64 native router. The build is pinned to commit
`cf2aee3de37c56d1c530f58295ff6c7521472129`. The fork changes missing-proxy handling to fail
closed and raises the internal process-pattern capacity so an atomic guard can cover the complete
bounded rule set. It also exposes the opt-in UDP/53 routing control used by KokoroBox application
routing. Its history retains the upstream source and license.

ProxyBridge is distributed under the MIT License. Copyright (c) 2025
Anof-cyber/InterceptSuite. The complete license is packaged next to the sidecar as
`LICENSE.ProxyBridge`.

## WinDivert

The Windows sidecar dynamically links to the unmodified WinDivert 2.2.2 runtime and uses the
LGPL-3.0-only licensing option. The official release archive and corresponding source are
available from [WinDivert releases](https://github.com/basil00/WinDivert/releases/tag/v2.2.2).
Its complete license is packaged next to the sidecar as `LICENSE.WinDivert`; recipients may
replace the dynamically linked library in accordance with that license.
