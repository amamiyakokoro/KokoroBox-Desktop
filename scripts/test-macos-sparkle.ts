import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'
import {
  assertSparkleArchive,
  sha256File,
  sparkleAppcastName,
  sparkleDownloadURLPrefix,
  sparkleFeedURL,
  sparkleRelease,
  sparkleUpdateArchiveName,
  validateSignedSparkleAppcast,
  validateSparkleSigningKeys
} from './macos-sparkle.ts'

const privateKey = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE='
const publicKey = 'iojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1w='

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

test('Sparkle release names and feeds are fixed by channel and architecture', () => {
  assert.equal(
    sparkleUpdateArchiveName('2.26.8', 'arm64'),
    'kokorobox-desktop-macos-2.26.8-arm64.zip'
  )
  assert.equal(sparkleAppcastName('x64'), 'appcast-macos-x64.xml')
  assert.match(
    sparkleFeedURL('stable', 'arm64'),
    /releases\/latest\/download\/appcast-macos-arm64\.xml$/
  )
  assert.match(
    sparkleFeedURL('rolling', 'x64'),
    /releases\/download\/rolling\/appcast-macos-x64\.xml$/
  )
  assert.match(sparkleDownloadURLPrefix('v2.26.8'), /releases\/download\/v2\.26\.8\/$/)
  assert.throws(() => sparkleFeedURL('preview', 'x64'))
  assert.throws(() => sparkleUpdateArchiveName('../../bad', 'x64'))
})

test('Sparkle signing keys must be canonical matching Ed25519 keys', () => {
  validateSparkleSigningKeys(privateKey, publicKey)
  assert.throws(() =>
    validateSparkleSigningKeys(privateKey, Buffer.alloc(32, 2).toString('base64'))
  )
  assert.throws(() => validateSparkleSigningKeys('not-base64', publicKey))
})

test('Sparkle appcast validation requires archive and feed signatures', () => {
  const archive = sparkleUpdateArchiveName('2.26.8', 'x64')
  const prefix = sparkleDownloadURLPrefix('v2.26.8')
  const signed = `<enclosure url="${prefix}${archive}" sparkle:edSignature="YWJjZA==" /><!-- sparkle-signatures:\nedSignature: YWJjZA==\nlength: 123\n-->`
  assert.equal(validateSignedSparkleAppcast(signed, archive, prefix), 'YWJjZA==')
  assert.throws(() =>
    validateSignedSparkleAppcast(signed.replace('length:', 'size:'), archive, prefix)
  )
  assert.throws(() =>
    validateSignedSparkleAppcast(signed, archive, sparkleDownloadURLPrefix('2.26.9'))
  )
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

test('main process adapter is present but cannot activate before migration', () => {
  const adapter = readFileSync('src/main/resolve/macosNativeUpdater.ts', 'utf8')
  const updater = readFileSync('src/main/resolve/autoUpdater.ts', 'utf8')

  assert.match(adapter, /export const macOSNativeUpdaterEnabled = false/)
  assert.match(adapter, /process\.dlopen\(nativeModule, modulePath\)/)
  assert.doesNotMatch(adapter, /process\.env|napi_get_value_string/)
  assert.match(updater, /if \(showNativeMacOSUpdate\(\)\) return/)
})
