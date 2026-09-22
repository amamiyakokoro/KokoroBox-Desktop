import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectMihomoAlphaAsset } from './mihomo-alpha-release.ts'

const release = {
  assets: [
    {
      name: 'mihomo-linux-arm64-alpha-91dd03a.gz',
      browser_download_url:
        'https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/mihomo-linux-arm64-alpha-91dd03a.gz'
    },
    {
      name: 'mihomo-linux-amd64-v3-alpha-91dd03a.gz',
      browser_download_url:
        'https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/mihomo-linux-amd64-v3-alpha-91dd03a.gz'
    },
    {
      name: 'mihomo-windows-arm64-alpha-91dd03a.zip',
      browser_download_url:
        'https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/mihomo-windows-arm64-alpha-91dd03a.zip'
    }
  ]
}

test('selects the exact release asset for the requested platform', () => {
  assert.equal(
    selectMihomoAlphaAsset(release, 'mihomo-linux-arm64', 'gz').name,
    'mihomo-linux-arm64-alpha-91dd03a.gz'
  )
  assert.equal(
    selectMihomoAlphaAsset(release, 'mihomo-windows-arm64', 'zip').name,
    'mihomo-windows-arm64-alpha-91dd03a.zip'
  )
  assert.throws(() => selectMihomoAlphaAsset(release, 'mihomo-linux-amd64-v2', 'gz'))
})

test('rejects malformed metadata and assets without a matching download URL', () => {
  assert.throws(() => selectMihomoAlphaAsset({}, 'mihomo-linux-arm64', 'gz'))
  assert.throws(() =>
    selectMihomoAlphaAsset(
      { assets: [{ name: 'mihomo-linux-arm64-alpha-91dd03a.gz', browser_download_url: '' }] },
      'mihomo-linux-arm64',
      'gz'
    )
  )
})
