import { createHash } from 'node:crypto'

export const KOKOROBOX_SERVICE_STABLE_TAG = 'v0.2.2'

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

  return {
    downloadURL,
    filename,
    sha256URL: `${downloadURL}.sha256`,
    tag
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
