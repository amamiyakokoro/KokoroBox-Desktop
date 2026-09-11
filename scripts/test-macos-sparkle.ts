import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'
import { assertSparkleArchive, sha256File, sparkleRelease } from './macos-sparkle.ts'

test('Sparkle dependency is pinned to an immutable release and SHA-256 digest', () => {
  assert.match(sparkleRelease.version, /^\d+\.\d+\.\d+$/)
  assert.match(sparkleRelease.sha256, /^[a-f0-9]{64}$/)
  assert.equal(
    sparkleRelease.url,
    `https://github.com/sparkle-project/Sparkle/releases/download/${sparkleRelease.version}/${sparkleRelease.archiveName}`
  )
  assert.doesNotMatch(sparkleRelease.url, /latest/i)
})

test('Sparkle archive verification rejects modified content', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-sparkle-test-'))
  const archive = path.join(directory, 'Sparkle.zip')
  try {
    writeFileSync(archive, 'modified archive')
    assert.equal(sha256File(archive), createHash('sha256').update('modified archive').digest('hex'))
    assert.throws(() => assertSparkleArchive(archive), /integrity check failed/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('macOS package stages the updater without exposing dynamic trust inputs', () => {
  const build = parse(readFileSync('electron-builder.yml', 'utf8'))
  assert.ok(build.extraResources[0].filter.includes('!macos-updater{,/**/*}'))
  assert.deepEqual(
    build.mac.extraFiles
      .filter((entry: { from: string }) => entry.from.includes('macos-updater'))
      .map((entry: { to: string }) => entry.to),
    [
      'Frameworks/Sparkle.framework',
      'Frameworks/kokorobox-updater.node',
      'Resources/licenses/LICENSE.Sparkle',
      'Resources/macos-updater/manifest.json'
    ]
  )

  const source = readFileSync('native/macos-updater/KokoroBoxUpdaterBridge.mm', 'utf8')
  assert.match(source, /objectForInfoDictionaryKey:@"SUFeedURL"/)
  assert.match(source, /objectForInfoDictionaryKey:@"SUPublicEDKey"/)
  assert.match(source, /isEqualToString:@"https"/)
  assert.doesNotMatch(source, /napi_get_value_string/)

  const binding = JSON.parse(readFileSync('native/macos-updater/binding.gyp', 'utf8'))
  assert.ok(binding.targets[0].xcode_settings.LD_RUNPATH_SEARCH_PATHS.includes('@loader_path'))
})
