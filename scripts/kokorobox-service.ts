import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'

export const KOKOROBOX_SERVICE_STABLE_TAG = 'v0.6.2'
export const KOKOROBOX_PROCESS_ROUTER_FILES = Object.freeze([
  'kokorobox-process-router.exe',
  'ProxyBridgeCore.dll',
  'WinDivert.dll',
  'WinDivert64.sys',
  'LICENSE.ProxyBridge',
  'LICENSE.WinDivert',
  'manifest.json',
  'process-router-sbom.cdx.json'
])

const targets: Record<string, string> = {
  'win32-x64': 'kokorobox-service-windows-amd64-v3',
  'win32-arm64': 'kokorobox-service-windows-arm64',
  'darwin-x64': 'kokorobox-service-darwin-amd64-v3',
  'darwin-arm64': 'kokorobox-service-darwin-arm64',
  'linux-x64': 'kokorobox-service-linux-amd64-v3',
  'linux-arm64': 'kokorobox-service-linux-arm64'
}

export function kokoroboxServiceAsset(platform: string, arch: string, channel?: string) {
  if (channel !== undefined && channel !== 'stable' && channel !== 'rolling') {
    throw new Error(`unsupported release channel "${channel}"`)
  }

  const base = targets[`${platform}-${arch}`]
  if (!base) throw new Error(`unsupported platform "${platform}-${arch}"`)

  const extension = platform === 'win32' ? '.exe' : ''
  const filename = `${base}${extension}`
  const tag = channel === 'stable' ? KOKOROBOX_SERVICE_STABLE_TAG : 'pre-release'
  const downloadURL = `https://github.com/amamiyakokoro/kokorobox-service/releases/download/${tag}/${filename}`

  const processRouterFilename =
    platform === 'win32' && arch === 'x64' ? `${base}-process-router.zip` : undefined

  return {
    downloadURL,
    filename,
    sha256URL: `${downloadURL}.sha256`,
    tag,
    processRouter: processRouterFilename
      ? {
          downloadURL: `https://github.com/amamiyakokoro/kokorobox-service/releases/download/${tag}/${processRouterFilename}`,
          filename: processRouterFilename,
          sha256URL: `https://github.com/amamiyakokoro/kokorobox-service/releases/download/${tag}/${processRouterFilename}.sha256`
        }
      : undefined
  }
}

export function verifyKokoroBoxServiceChecksum(
  filename: string,
  contents: Uint8Array,
  checksum: string
): void {
  const match = checksum.trim().match(/^([a-f0-9]{64})\s+\*?([^\s]+)$/)
  if (!match || match[2] !== filename) {
    throw new Error(`Invalid SHA-256 checksum for ${filename}`)
  }

  const actualSha256 = createHash('sha256').update(contents).digest('hex')
  if (actualSha256 !== match[1]) {
    throw new Error(
      `kokorobox-service SHA-256 mismatch: expected ${match[1]}, received ${actualSha256}`
    )
  }
}

export function extractKokoroBoxServiceProcessRouterBundle(
  archive: Uint8Array,
  outputDirectory: string
): void {
  const entries = new AdmZip(Buffer.from(archive))
    .getEntries()
    .filter((entry) => !entry.isDirectory)
  const expectedEntries = KOKOROBOX_PROCESS_ROUTER_FILES.map(
    (name) => `process-router/${name}`
  ).sort()
  const actualEntries = entries.map((entry) => entry.entryName.replaceAll('\\', '/')).sort()
  if (
    actualEntries.length !== expectedEntries.length ||
    actualEntries.some((name, index) => name !== expectedEntries[index])
  ) {
    throw new Error('Unexpected files in KokoroBox Service Process Router bundle')
  }

  mkdirSync(outputDirectory, { recursive: true })
  for (const entry of entries) {
    const name = path.posix.basename(entry.entryName.replaceAll('\\', '/'))
    const contents = entry.getData()
    if (contents.length === 0) throw new Error(`Empty Process Router bundle file: ${name}`)
    writeFileSync(path.join(outputDirectory, name), contents)
  }
}
