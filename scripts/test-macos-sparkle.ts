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
import {
  configureNativeMacOSUpdater,
  runNativeMacOSUpdater
} from '../src/main/resolve/macosNativeUpdaterState.ts'

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

test('macOS package stages the updater with only a bounded dynamic channel', () => {
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
  assert.match(source, /napi_get_value_string_utf8/)
  assert.match(source, /update channel must be stable or rolling/)
  assert.doesNotMatch(source, /URLWithString:channel/)

  const binding = JSON.parse(readFileSync('native/macos-updater/binding.gyp', 'utf8'))
  assert.ok(binding.targets[0].xcode_settings.LD_RUNPATH_SEARCH_PATHS.includes('@loader_path'))
})

test('main process adapter activates Sparkle and validates its state transitions', () => {
  const adapter = readFileSync('src/main/resolve/macosNativeUpdater.ts', 'utf8')
  const updater = readFileSync('src/main/resolve/autoUpdater.ts', 'utf8')
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  const actions = readFileSync('src/renderer/src/components/settings/actions.tsx', 'utf8')
  const main = readFileSync('src/main/index.ts', 'utf8')
  const ipc = readFileSync('src/main/utils/ipc.ts', 'utf8')

  assert.match(adapter, /export const macOSNativeUpdaterEnabled = true/)
  assert.match(adapter, /process\.dlopen\(nativeModule, modulePath\)/)
  assert.match(adapter, /typeof candidate\.configure !== 'function'/)
  assert.doesNotMatch(adapter, /process\.env|napi_get_value_string/)
  assert.match(updater, /if \(process\.platform === 'darwin'\) \{[\s\S]*launchNativeMacOSUpdate/)
  assert.doesNotMatch(updater, /\.pkg|installer -pkg/)
  assert.match(app, /platform !== 'darwin' && autoCheckUpdate/)
  assert.match(actions, /if \(platform === 'darwin'\) return/)
  assert.match(main, /configureNativeMacOSUpdate\([\s\S]*appConfig\.autoCheckUpdate/)
  assert.match(ipc, /configureNativeMacOSUpdate\([\s\S]*nextConfig\.autoCheckUpdate/)
  assert.match(updater, /return 'native'/)
  assert.match(updater, /releaseTag === 'rolling' \? 'rolling' : 'stable'/)
  assert.match(updater, /shell\.openExternal/)
  assert.match(updater, /native macOS updater unavailable[\s\S]*return 'external'/)

  const calls: string[] = []
  const bridge = {
    state: () => ({ available: true, initialized: false, canCheckForUpdates: false }),
    initialize: (channel: 'stable' | 'rolling') => {
      calls.push(`initialize:${channel}`)
      return { available: true, initialized: true, canCheckForUpdates: true }
    },
    configure: (channel: 'stable' | 'rolling', enabled: boolean) => {
      calls.push(`configure:${channel}:${enabled}`)
      return { available: true, initialized: true, canCheckForUpdates: true }
    },
    checkForUpdates: (channel: 'stable' | 'rolling') => {
      calls.push(`check:${channel}`)
      return { available: true, initialized: true, canCheckForUpdates: true }
    }
  }
  runNativeMacOSUpdater(bridge, 'rolling')
  assert.deepEqual(calls, ['initialize:rolling', 'check:rolling'])
  calls.length = 0
  configureNativeMacOSUpdater(bridge, 'stable', true)
  assert.deepEqual(calls, ['initialize:stable', 'configure:stable:true'])
  assert.throws(() =>
    runNativeMacOSUpdater(
      {
        ...bridge,
        state: () => ({ available: false, initialized: false, canCheckForUpdates: false })
      },
      'stable'
    )
  )
  calls.length = 0
  runNativeMacOSUpdater(
    {
      ...bridge,
      state: () => ({ available: true, initialized: true, canCheckForUpdates: false })
    },
    'stable'
  )
  assert.deepEqual(calls, [])
})

test('native bridge restricts the feed and validates the 32-byte public key', () => {
  const source = readFileSync('native/macos-updater/KokoroBoxUpdaterBridge.mm', 'utf8')
  assert.match(source, /https:\/\/github\.com\/amamiyakokoro\/KokoroBox-Desktop/)
  assert.match(source, /releases\/latest\/download/)
  assert.match(source, /releases\/download\/rolling/)
  assert.match(source, /appcast-macos-arm64\.xml/)
  assert.match(source, /appcast-macos-x64\.xml/)
  assert.match(source, /KBReadChannel/)
  assert.match(source, /isEqualToString:@"stable"/)
  assert.match(source, /isEqualToString:@"rolling"/)
  assert.match(source, /feedURLStringForUpdater/)
  assert.match(source, /decodedPublicKey\.length != 32/)
  assert.match(source, /automaticallyChecksForUpdates = enabled/)
  assert.match(source, /resetUpdateCycleAfterShortDelay/)
  assert.match(source, /\{"configure", nullptr, KBConfigureUpdater/)
})
