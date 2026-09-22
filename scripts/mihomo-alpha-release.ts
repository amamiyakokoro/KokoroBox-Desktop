type ReleaseAsset = {
  name: string
  browser_download_url: string
}

export function selectMihomoAlphaAsset(
  release: unknown,
  binaryName: string,
  extension: 'gz' | 'zip'
): ReleaseAsset {
  if (!release || typeof release !== 'object' || !('assets' in release)) {
    throw new Error('Mihomo Alpha release metadata is missing assets')
  }

  const assets = release.assets
  if (!Array.isArray(assets)) {
    throw new Error('Mihomo Alpha release assets are invalid')
  }

  const assetName = new RegExp(`^${binaryName}-alpha-[0-9a-f]+\\.${extension}$`)
  const asset = assets.find(
    (candidate): candidate is ReleaseAsset =>
      candidate !== null &&
      typeof candidate === 'object' &&
      typeof candidate.name === 'string' &&
      assetName.test(candidate.name) &&
      typeof candidate.browser_download_url === 'string' &&
      candidate.browser_download_url.startsWith(
        'https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/'
      )
  )

  if (!asset) {
    throw new Error(`Mihomo Alpha release has no ${binaryName} .${extension} asset`)
  }
  return asset
}
