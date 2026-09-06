export const proxyBridgeSourceRevision = '4c2de905b12cf739f07453de3c0e8ce0361d198d'
export const winDivertVersion = '2.2.2'
export const winDivertArchiveSha256 =
  '63cb41763bb4b20f600b6de04e991a9c2be73279e317d4d82f237b150c5f3f15'
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
