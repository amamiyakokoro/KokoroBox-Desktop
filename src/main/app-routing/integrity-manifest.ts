import sourceManifest from '../../../build/proxybridge/source-manifest.json'

export const proxyBridgeRepository = sourceManifest.proxyBridgeRepository
export const proxyBridgeSourceRevision = sourceManifest.proxyBridgeRevision
export const winDivertVersion = sourceManifest.winDivertVersion
export const winDivertUrl = sourceManifest.winDivertUrl
export const winDivertArchiveSha256 = sourceManifest.winDivertArchiveSha256
export const processRouterBinaryNames = Object.freeze([
  'kokorobox-process-router.exe',
  'ProxyBridgeCore.dll',
  'WinDivert.dll',
  'WinDivert64.sys'
])

export interface ProcessRouterManifest {
  version: 1
  proxyBridgeRevision: string
  winDivertVersion: string
  winDivertArchiveSha256: string
  sha256: Record<string, string>
}

export function validateProcessRouterManifest(
  manifest: ProcessRouterManifest,
  actualHashes: Record<string, string>
): void {
  if (
    manifest.version !== 1 ||
    manifest.proxyBridgeRevision !== proxyBridgeSourceRevision ||
    manifest.winDivertVersion !== winDivertVersion ||
    manifest.winDivertArchiveSha256 !== winDivertArchiveSha256
  ) {
    throw new Error('Unexpected process router source provenance')
  }
  for (const name of processRouterBinaryNames) {
    if (!/^[a-f0-9]{64}$/.test(manifest.sha256[name] || '')) {
      throw new Error(`Missing process router checksum: ${name}`)
    }
    if (actualHashes[name] !== manifest.sha256[name]) {
      throw new Error(`Process router checksum mismatch: ${name}`)
    }
  }
}
