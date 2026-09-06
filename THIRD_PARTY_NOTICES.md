# Third-party notices

## ProxyBridge

KokoroBox uses a modified subset of [ProxyBridge](https://github.com/InterceptSuite/ProxyBridge)
as the packet-interception core behind its Windows x64 native router. The build is pinned to commit
`02703a0672a8b94011a4698368a392f7734c10dc` and changes missing-proxy handling to fail closed.

ProxyBridge is distributed under the MIT License. Copyright (c) 2025
Anof-cyber/InterceptSuite. The complete license is packaged next to the sidecar as
`LICENSE.ProxyBridge.txt`.

## WinDivert

The Windows sidecar includes WinDivert 2.2.2. Its complete license is packaged next to the
sidecar as `LICENSE.WinDivert.txt`.
