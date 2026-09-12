import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  existsSync
} from 'node:fs'
import os from 'node:os'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'
import {
  artifactName,
  collectArtifacts,
  macDmgArtifactName,
  releaseTargets,
  stageArtifact,
  targetId
} from './release-artifacts.ts'
import { compareVersions, normalizeVersion, planRelease } from './release-plan.ts'
import {
  sparkleAppcastName,
  sparkleDownloadURLPrefix,
  sparkleFeedURL,
  sparkleUpdateArchiveName
} from './macos-sparkle.ts'
import {
  proxyBridgeSourceRevision,
  winDivertArchiveSha256
} from '../src/main/app-routing/integrity-manifest.ts'
import {
  TRAFFIC_MONITOR_VERSION,
  trafficMonitorAsset,
  trafficMonitorDownloadUrl
} from './traffic-monitor.ts'
import {
  KOKOROBOX_SERVICE_STABLE_TAG,
  kokoroboxServiceAsset,
  verifyKokoroBoxServiceChecksum
} from './kokorobox-service.ts'

const sha = '1234567890abcdef1234567890abcdef12345678'
const base = { packageVersion: '2.26.8', sha }
const workflow = (name: string) => parse(readFileSync(`.github/workflows/${name}.yml`, 'utf8'))

test('stable tag pushes preserve their exact v-prefixed or unprefixed tag', () => {
  for (const tag of ['v2.26.8', '2.26.8']) {
    assert.deepEqual(planRelease({ ...base, event: 'push', refName: tag }), {
      should_release: true,
      version: '2.26.8',
      tag
    })
  }
  assert.deepEqual(
    planRelease({ ...base, packageVersion: '2.26.9-1', event: 'push', refName: '2.26.9-1' }),
    { should_release: true, version: '2.26.9-1', tag: '2.26.9-1' }
  )
})

test('manual releases default to package version and reject mismatched or unsafe tags', () => {
  assert.equal(planRelease({ ...base, event: 'workflow_dispatch' }).tag, 'v2.26.8')
  assert.equal(
    planRelease({ ...base, event: 'workflow_dispatch', inputVersion: 'v2.27.0' }).version,
    '2.27.0'
  )
  assert.equal(normalizeVersion('v2.26.9-1'), '2.26.9-1')
  assert.ok(compareVersions('2.26.9-2', '2.26.9-1') > 0)
  assert.ok(compareVersions('2.26.9', '2.26.9-2') > 0)
  for (const inputTag of ['rolling', 'v2.26.9', '../2.26.8', '2.26.8\nkey=value']) {
    assert.throws(() => planRelease({ ...base, event: 'workflow_dispatch', inputTag }))
  }
  for (const version of ['2.26', '02.26.8', 'v2.26.8-beta', '2.26.8;echo bad'])
    assert.throws(() => normalizeVersion(version))
  assert.throws(() => planRelease({ ...base, event: 'unexpected' }))
  assert.throws(() => planRelease({ ...base, event: 'rolling', sha: 'unknown' }))
})

test('rolling versions use one commit and do not regress behind newer stable tags', () => {
  assert.equal(planRelease({ ...base, event: 'rolling' }).version, '2.26.9-rolling-1234567')
  assert.equal(
    planRelease({ ...base, event: 'rolling', stableTags: ['v2.26.10', 'v2.26.9', 'rolling'] })
      .version,
    '2.26.11-rolling-1234567'
  )
  assert.equal(
    planRelease({ ...base, packageVersion: '2.26.9-1', event: 'rolling' }).version,
    '2.26.10-rolling-1234567'
  )
})

test('monthly releases bootstrap without a stable tag, skip unchanged/non-month-end runs and advance tags', () => {
  const monthly = { ...base, event: 'schedule', now: new Date('2026-09-30T04:00:00Z') }
  assert.equal(planRelease(monthly).version, '2.26.8')
  assert.equal(planRelease({ ...monthly, stableTags: ['v2.26.9'] }).version, '2.26.10')
  assert.equal(planRelease({ ...monthly, stableTags: ['v2.26.7'] }).version, '2.26.8')
  assert.equal(planRelease({ ...monthly, hasChanges: false }).should_release, false)
  assert.equal(
    planRelease({ ...monthly, now: new Date('2026-09-28T04:00:00Z') }).should_release,
    false
  )
  assert.equal(
    planRelease({ ...monthly, now: new Date('2026-09-30T17:00:00Z') }).should_release,
    true
  )
})

test('build matrix exactly matches the 10 required platform jobs', () => {
  const build = workflow('build')
  assert.deepEqual(
    build.jobs.build.strategy.matrix.include.map(
      ({ os, arch, format }: { os: string; arch: string; format: string }) => ({
        os,
        arch,
        format
      })
    ),
    releaseTargets
  )
  assert.equal(new Set(releaseTargets.map(targetId)).size, 10)
  assert.equal(new Set(releaseTargets.map((target) => artifactName(target, '2.26.8'))).size, 10)
  assert.match(artifactName(releaseTargets[0], '2.26.9-1'), /2\.26\.9-1/)
  assert.deepEqual([...new Set(releaseTargets.map((target) => target.arch))], ['x64', 'arm64'])
  assert.equal(
    artifactName({ os: 'ubuntu-latest', arch: 'arm64', format: 'rpm' }, '2.26.8'),
    'kokorobox-desktop-linux-2.26.8-aarch64.rpm'
  )
  assert.equal(
    artifactName({ os: 'macos-latest', arch: 'arm64', format: 'pkg' }, '2.26.8'),
    'kokorobox-desktop-macos-2.26.8-arm64.pkg'
  )
  assert.equal(macDmgArtifactName('2.26.8', 'arm64'), 'kokorobox-desktop-macos-2.26.8-arm64.dmg')
  assert.equal(
    artifactName(
      {
        os: 'windows-latest',
        arch: 'x64',
        format: 'nsis'
      },
      '2.26.8'
    ),
    'kokorobox-desktop-windows-2.26.8-x64-setup.exe'
  )
  assert.throws(() =>
    artifactName({ os: 'windows-latest', arch: 'ia32', format: 'nsis' }, '2.26.8')
  )
  assert.throws(() => artifactName(releaseTargets[0], '../../bad'))

  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const builder = parse(readFileSync('electron-builder.yml', 'utf8'))
  assert.match(packageJson.scripts['build:win'], /^pnpm run prepare:windows-routing &&/)
  assert.doesNotMatch(packageJson.scripts['build:win'], /auto-elevate|manual-elevation/)
  assert.equal(packageJson.scripts['build:win:auto-elevate'], undefined)
  assert.equal(packageJson.scripts['build:win:manual-elevation'], undefined)
  assert.equal(builder.win.requestedExecutionLevel, 'asInvoker')
  assert.equal(builder.nsis.artifactName, `\${name}-windows-\${version}-\${arch}-setup.\${ext}`)
  assert.equal(builder.nsis.oneClick, false)
  assert.equal(builder.nsis.perMachine, false)
  assert.equal(builder.nsis.selectPerMachineByDefault, true)
  assert.equal(builder.nsis.allowElevation, true)
  assert.equal(existsSync('electron-builder.windows-auto-elevate.yml'), false)
  assert.equal(existsSync('electron-builder.windows-manual-elevation.yml'), false)
  const updater = readFileSync('src/main/resolve/autoUpdater.ts', 'utf8')
  assert.doesNotMatch(updater, /windowsElevationVariant|auto-elevate|manual-elevation/)

  const uploadSteps = build.jobs.build.steps.filter(
    (step: { uses?: string }) => step.uses === 'actions/upload-artifact@v7'
  )
  assert.equal(uploadSteps.length, 2)
  assert.equal(uploadSteps[0].id, 'upload_artifacts')
  assert.equal(uploadSteps[0]['continue-on-error'], true)
  assert.equal(uploadSteps[1].if, "steps.upload_artifacts.outcome == 'failure'")
  assert.equal(uploadSteps[1].with.overwrite, true)
})

test('packaged macOS copies move to Applications before initialization', () => {
  const source = readFileSync('src/main/index.ts', 'utf8')
  assert.match(source, /app\.isPackaged/)
  assert.match(source, /app\.isInApplicationsFolder\(\)/)
  assert.match(source, /app\.moveToApplicationsFolder\(\)/)
  assert.ok(
    source.indexOf('await ensureMacOSApplicationsLocation()') <
      source.indexOf('appConfig = await (initPromise ?? init())')
  )
})

test('desktop uses the independently maintained KokoroBox native packages', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const nativeSpecifier = packageJson.dependencies['kokorobox-native']
  assert.equal(typeof nativeSpecifier, 'string')
  assert.match(nativeSpecifier, /^[~^]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  const nativeVersion = nativeSpecifier.replace(/^[~^]/, '')
  assert.equal(packageJson.dependencies['@uruhalushia/sparkle-native'], undefined)

  const platformPackages = [
    'win32-x64-msvc',
    'win32-arm64-msvc',
    'darwin-x64',
    'darwin-arm64',
    'linux-x64-gnu',
    'linux-arm64-gnu'
  ].map((target) => `kokorobox-native-${target}`)
  const buildWorkflow = readFileSync('.github/workflows/build.yml', 'utf8')
  const lockfile = readFileSync('pnpm-lock.yaml', 'utf8')
  const escapedNativeVersion = nativeVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  for (const packageName of platformPackages) {
    assert.match(buildWorkflow, new RegExp(packageName))
    assert.match(lockfile, new RegExp(`${packageName}@${escapedNativeVersion}`))
  }
  assert.doesNotMatch(buildWorkflow, /@uruhalushia\/sparkle-native/)
  assert.doesNotMatch(lockfile, /@uruhalushia\/sparkle-native/)

  for (const file of [
    'src/main/config/profile.ts',
    'src/main/core/permission.ts',
    'src/main/service/manager.ts',
    'src/main/sys/misc.ts',
    'src/main/utils/elevation.ts',
    'src/main/utils/icon.ts',
    'src/main/utils/ipc.ts'
  ]) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /from 'kokorobox-native'/, file)
    assert.doesNotMatch(source, /sparkle-native/, file)
  }
})

test('stable builds pin verified service releases while rolling builds follow pre-release', () => {
  assert.equal(KOKOROBOX_SERVICE_STABLE_TAG, 'v0.2.4')
  assert.deepEqual(kokoroboxServiceAsset('win32', 'x64', 'stable'), {
    downloadURL:
      'https://github.com/amamiyakokoro/kokorobox-service/releases/download/v0.2.4/kokorobox-service-windows-amd64-v3.exe',
    filename: 'kokorobox-service-windows-amd64-v3.exe',
    sha256URL:
      'https://github.com/amamiyakokoro/kokorobox-service/releases/download/v0.2.4/kokorobox-service-windows-amd64-v3.exe.sha256',
    tag: 'v0.2.4'
  })
  assert.equal(kokoroboxServiceAsset('linux', 'arm64', 'rolling').tag, 'pre-release')
  assert.equal(kokoroboxServiceAsset('darwin', 'arm64').tag, 'pre-release')
  assert.throws(() => kokoroboxServiceAsset('win32', 'ia32', 'stable'))
  assert.throws(() => kokoroboxServiceAsset('linux', 'x64', 'nightly'))

  const contents = Buffer.from('service fixture')
  const filename = 'kokorobox-service-linux-arm64'
  const checksum = `${createHash('sha256').update(contents).digest('hex')}  ${filename}`
  assert.doesNotThrow(() => verifyKokoroBoxServiceChecksum(filename, contents, checksum))
  assert.throws(
    () => verifyKokoroBoxServiceChecksum(filename, Buffer.from('tampered'), checksum),
    /SHA-256 mismatch/
  )
  assert.throws(
    () => verifyKokoroBoxServiceChecksum(filename, contents, `${checksum}.unexpected`),
    /Invalid SHA-256 checksum/
  )

  const build = workflow('build')
  assert.equal(build.jobs.build.env.RELEASE_CHANNEL, '${{ inputs.channel }}')
  const prepare = readFileSync('scripts/prepare.ts', 'utf8')
  assert.match(prepare, /sha256URL: asset\.sha256URL/)
  assert.match(prepare, /verifyKokoroBoxServiceChecksum/)
})

test('platform discovery and core permissions use constrained native APIs', () => {
  const permission = readFileSync('src/main/core/permission.ts', 'utf8')
  const permissionCheck = readFileSync('src/main/core/permission-check.ts', 'utf8')
  const network = readFileSync('src/main/core/network.ts', 'utf8')
  const ssid = readFileSync('src/main/sys/ssid.ts', 'utf8')

  assert.match(permission, /setCorePrivileges/)
  assert.match(permissionCheck, /getCorePrivilegeStatus/)
  assert.doesNotMatch(permission, /(?:pkexec|osascript|bash\s+-c|chmod|chown)/)
  assert.match(network, /getNetworkContext/)
  assert.match(ssid, /getNetworkContext/)
  assert.doesNotMatch(ssid, /(?:netsh|iwconfig|airport\s+-I)/)
})

test('Linux artifact architecture names agree with electron-builder, including ARM64 Pacman', () => {
  const { Arch, getArtifactArchName } = createRequire(import.meta.url)('builder-util/out/arch.js')
  for (const target of releaseTargets.filter((target) => target.os === 'ubuntu-latest')) {
    const arch = getArtifactArchName(Arch[target.arch], target.format)
    assert.equal(
      artifactName(target, '2.26.8'),
      `kokorobox-desktop-linux-2.26.8-${arch}.${target.format === 'pacman' ? 'pkg.tar.zst' : target.format}`
    )
  }
})

test('removed LoongArch64 targets and build/download configuration cannot return', () => {
  for (const format of ['deb', 'rpm', 'pacman']) {
    assert.throws(
      () => artifactName({ os: 'ubuntu-latest', arch: 'loong64', format }, '2.26.8'),
      /Unsupported release target/
    )
  }
  for (const file of ['.github/workflows/build.yml', 'scripts/prepare.ts', 'pnpm-workspace.yaml']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /loong/i, file)
  }
})

function fixtures(fn: (source: string, output: string) => void, version = '2.26.8') {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-release-test-'))
  const source = path.join(dir, 'artifacts')
  const output = path.join(dir, 'release')
  const packages = path.join(dir, 'packages')
  mkdirSync(packages)
  try {
    const processRouterSbom = path.join(packages, 'process-router-sbom.cdx.json')
    writeFileSync(
      processRouterSbom,
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        version: 1,
        metadata: {
          properties: [
            {
              name: 'kokorobox:proxybridge-revision',
              value: proxyBridgeSourceRevision
            },
            {
              name: 'kokorobox:windivert-archive-sha256',
              value: winDivertArchiveSha256
            }
          ]
        }
      })
    )
    for (const target of releaseTargets) {
      writeFileSync(
        path.join(packages, artifactName(target, version)),
        `fixture: ${targetId(target)}`
      )
      const filename = artifactName(target, version)
      const sparkleReleaseTag = version.includes('-rolling-') ? 'rolling' : `v${version}`
      if (target.os === 'macos-latest') {
        writeFileSync(
          path.join(packages, macDmgArtifactName(version, target.arch)),
          `dmg: ${target.arch}`
        )
        const archiveFilename = sparkleUpdateArchiveName(version, target.arch)
        const appcastFilename = sparkleAppcastName(target.arch)
        const prefix = sparkleDownloadURLPrefix(sparkleReleaseTag)
        writeFileSync(path.join(packages, archiveFilename), `update: ${target.arch}`)
        writeFileSync(
          path.join(packages, appcastFilename),
          `<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><item><enclosure url="${prefix}${archiveFilename}" sparkle:edSignature="YWJjZA==" length="13" /></item></channel></rss><!-- sparkle-signatures:\nedSignature: YWJjZA==\nlength: 200\n-->`
        )
      }
      const signing =
        target.os === 'macos-latest'
          ? {
              status: 'apple-notarized' as const,
              teamId: 'TESTTEAM00',
              notarizationId: '12345678-1234-1234-1234-123456789abc',
              version,
              sha,
              filename,
              checksum: createHash('sha256')
                .update(readFileSync(path.join(packages, filename)))
                .digest('hex'),
              dmg: {
                notarizationId: 'abcdef12-3456-7890-abcd-ef1234567890',
                filename: macDmgArtifactName(version, target.arch),
                checksum: createHash('sha256')
                  .update(
                    readFileSync(path.join(packages, macDmgArtifactName(version, target.arch)))
                  )
                  .digest('hex')
              },
              sparkle: {
                appNotarizationId: '87654321-4321-4321-4321-cba987654321',
                releaseTag: sparkleReleaseTag,
                archiveFilename: sparkleUpdateArchiveName(version, target.arch),
                archiveChecksum: createHash('sha256')
                  .update(
                    readFileSync(
                      path.join(packages, sparkleUpdateArchiveName(version, target.arch))
                    )
                  )
                  .digest('hex'),
                appcastFilename: sparkleAppcastName(target.arch),
                appcastChecksum: createHash('sha256')
                  .update(readFileSync(path.join(packages, sparkleAppcastName(target.arch))))
                  .digest('hex'),
                feedURL: sparkleFeedURL(
                  version.includes('-rolling-') ? 'rolling' : 'stable',
                  target.arch
                ),
                publicKey: 'iojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1w='
              }
            }
          : undefined
      stageArtifact(
        target,
        version,
        sha,
        packages,
        source,
        signing,
        target.os === 'windows-latest' && target.arch === 'x64' ? processRouterSbom : undefined
      )
    }
    fn(source, output)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('collects complete builds, generates hashes and concise updater-compatible metadata', () => {
  fixtures((source, output) => {
    collectArtifacts('2.26.8', 'v2.26.8', sha, source, output, '- A change')
    const latest = parse(readFileSync(path.join(output, 'latest.yml'), 'utf8'))
    assert.equal(latest.version, '2.26.8')
    assert.equal(latest.tag, 'v2.26.8')
    assert.doesNotMatch(latest.changelog, /## Downloads|releases\/download\//)
    assert.match(latest.changelog, /- A change/)
    assert.match(latest.changelog, /Use the DMG for a normal first installation/)
    assert.match(latest.changelog, /Developer ID-signed, notarized by Apple/)
    assert.match(latest.changelog, /Linux RPM packages contain an OpenPGP signature/)
    assert.equal(readdirSync(output).length, 19)
    const lines = readFileSync(path.join(output, 'SHA256SUMS'), 'utf8').trim().split('\n')
    assert.equal(lines.length, 16)
    for (const line of lines) {
      const [digest, name] = line.split('  ')
      assert.equal(
        digest,
        createHash('sha256')
          .update(readFileSync(path.join(output, name)))
          .digest('hex')
      )
    }
    for (const arch of ['x64', 'arm64']) {
      const standard = path.join(output, `kokorobox-desktop-windows-2.26.8-${arch}-setup.exe`)
      const removedLegacyAlias = path.join(
        output,
        `kokorobox-desktop-windows-2.26.8-${arch}-manual-elevation-setup.exe`
      )
      assert.equal(existsSync(standard), true)
      assert.equal(existsSync(removedLegacyAlias), false)
    }
  })
})

for (const problem of ['missing', 'tampered', 'wrong-revision']) {
  test(`refuses ${problem} process router SBOM before producing publishable output`, () => {
    fixtures((source, output) => {
      const sbomName = 'kokorobox-process-router-2.26.8.cdx.json'
      const sbomFile = path.join(source, sbomName)
      if (problem === 'missing') rmSync(sbomFile)
      else if (problem === 'tampered') writeFileSync(sbomFile, '{}')
      else {
        const sbom = JSON.parse(readFileSync(sbomFile, 'utf8'))
        sbom.metadata.properties[0].value = 'a'.repeat(40)
        writeFileSync(sbomFile, JSON.stringify(sbom))
        const manifestFile = path.join(source, 'manifest-windows-latest-x64-nsis.json')
        const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
        manifest.sbom.checksum = createHash('sha256').update(readFileSync(sbomFile)).digest('hex')
        writeFileSync(manifestFile, JSON.stringify(manifest))
      }
      assert.throws(
        () => collectArtifacts('2.26.8', 'v2.26.8', sha, source, output, 'notes'),
        /SBOM/
      )
      assert.equal(existsSync(output), false)
    })
  })
}

test('rolling metadata keeps the dedicated rolling tag', () => {
  const version = '2.26.9-rolling-1234567'
  fixtures((source, output) => {
    collectArtifacts(version, 'rolling', sha, source, output, '- Rolling change')
    assert.equal(parse(readFileSync(path.join(output, 'latest.yml'), 'utf8')).tag, 'rolling')
  }, version)
})

for (const problem of [
  'missing',
  'empty',
  'tampered',
  'wrong-sha',
  'wrong-version',
  'wrong-filename',
  'extra'
]) {
  test(`refuses ${problem} artifacts before producing publishable output`, () => {
    fixtures((source, output) => {
      const name = artifactName(releaseTargets[0], '2.26.8')
      const file = path.join(source, name)
      const manifestFile = path.join(source, `manifest-${targetId(releaseTargets[0])}.json`)
      if (problem === 'missing') rmSync(file)
      else if (problem === 'empty') writeFileSync(file, '')
      else if (problem === 'tampered') writeFileSync(file, 'tampered')
      else if (problem === 'extra') writeFileSync(path.join(source, 'old.exe'), 'stale')
      else {
        const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
        if (problem === 'wrong-sha') manifest.sha = 'a'.repeat(40)
        if (problem === 'wrong-version') manifest.version = '2.26.7'
        if (problem === 'wrong-filename') manifest.filename = '../../unexpected'
        writeFileSync(manifestFile, JSON.stringify(manifest))
      }
      assert.throws(() => collectArtifacts('2.26.8', 'v2.26.8', sha, source, output, 'notes'))
      assert.equal(existsSync(output), false)
    })
  })
}

test('rejects mismatched release channels and pre-existing output', () => {
  fixtures((source, output) => {
    assert.throws(() => collectArtifacts('2.26.8', 'rolling', sha, source, output, 'notes'))
    assert.throws(() => collectArtifacts('2.26.8', 'v2.26.9', sha, source, output, 'notes'))
    mkdirSync(output)
    writeFileSync(path.join(output, 'old.exe'), 'old')
    assert.throws(() => collectArtifacts('2.26.8', 'v2.26.8', sha, source, output, 'notes'))
  })
})

test('collection rejects macOS packages without their matching notarization receipt', () => {
  fixtures((source, output) => {
    const manifestFile = path.join(source, 'manifest-macos-latest-arm64-pkg.json')
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    delete manifest.signing
    writeFileSync(manifestFile, JSON.stringify(manifest))
    assert.throws(
      () => collectArtifacts('2.26.8', 'v2.26.8', sha, source, output, 'notes'),
      /receipt/
    )
    assert.equal(existsSync(output), false)
  })
})

test('collection rejects a modified macOS DMG', () => {
  fixtures((source, output) => {
    writeFileSync(path.join(source, macDmgArtifactName('2.26.8', 'arm64')), 'tampered')
    assert.throws(
      () => collectArtifacts('2.26.8', 'v2.26.8', sha, source, output, 'notes'),
      /DMG|Checksum/
    )
    assert.equal(existsSync(output), false)
  })
})

test('collection rejects an unsigned Sparkle appcast even if its receipt checksum is refreshed', () => {
  fixtures((source, output) => {
    const appcastFile = path.join(source, sparkleAppcastName('x64'))
    writeFileSync(
      appcastFile,
      readFileSync(appcastFile, 'utf8').replace(' sparkle:edSignature="YWJjZA=="', '')
    )
    const manifestFile = path.join(source, 'manifest-macos-latest-x64-pkg.json')
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    manifest.signing.sparkle.appcastChecksum = createHash('sha256')
      .update(readFileSync(appcastFile))
      .digest('hex')
    writeFileSync(manifestFile, JSON.stringify(manifest))
    assert.throws(
      () => collectArtifacts('2.26.8', 'v2.26.8', sha, source, output, 'notes'),
      /signed archive or feed metadata/
    )
    assert.equal(existsSync(output), false)
  })
})

test('workflows gate publication on all builds and do not invoke upstream-only services', () => {
  for (const name of ['release', 'rolling']) {
    const config = workflow(name)
    assert.deepEqual(config.jobs.publish.needs, ['prepare', 'build'])
    assert.equal(config.jobs.build.uses, './.github/workflows/build.yml')
    assert.equal(config.jobs.publish.uses, './.github/workflows/publish.yml')
    assert.equal(
      config.jobs.publish.secrets.LINUX_GPG_PRIVATE_KEY,
      '${{ secrets.LINUX_GPG_PRIVATE_KEY }}'
    )
    assert.equal(
      config.jobs.publish.secrets.LINUX_GPG_PASSPHRASE,
      '${{ secrets.LINUX_GPG_PASSPHRASE }}'
    )
    assert.equal(config.jobs.publish.with.linux_gpg_fingerprint, undefined)
    assert.equal(config.concurrency['cancel-in-progress'], false)
    assert.equal(config.jobs.aur, undefined)
    assert.equal(config.jobs['update-version'], undefined)
  }
  const build = workflow('build')
  assert.equal(build.on.workflow_call.inputs.build_number.required, true)
  assert.equal(build.jobs.build.strategy['fail-fast'], false)
  assert.deepEqual(build.jobs.build.needs, ['validate', 'validate-traffic-monitor-plugin'])
  assert.equal(build.permissions.contents, 'read')
  const ciMac = parse(readFileSync('electron-builder.ci.yml', 'utf8'))
  assert.equal(ciMac.mac.identity, null)
  assert.equal(ciMac.mac.notarize, false)
  assert.equal(
    parse(readFileSync('electron-builder.yml', 'utf8')).linux.executableName,
    'kokorobox'
  )
  const buildEnvironment = readFileSync('scripts/build-env.ts', 'utf8')
  const releasePlan = readFileSync('scripts/release-plan.ts', 'utf8')
  assert.match(buildEnvironment, /KOKOROBOX_SYSTEM_CORE/)
  assert.match(buildEnvironment, /KOKOROBOX_SYSTEM_SERVICE/)
  assert.match(buildEnvironment, /SPARKLE_SYSTEM_CORE/)
  assert.match(buildEnvironment, /SPARKLE_SYSTEM_SERVICE/)
  assert.match(releasePlan, /git\('rev-list', '--count', 'HEAD'\)/)
  assert.match(releasePlan, /build_number: sourceBuildNumber/)
  const rolling = workflow('rolling')
  const release = workflow('release')
  assert.equal(rolling.jobs.build.with.build_number, '${{ needs.prepare.outputs.build_number }}')
  assert.equal(release.jobs.build.with.build_number, '${{ needs.prepare.outputs.build_number }}')
  const publish = readFileSync('.github/workflows/publish.yml', 'utf8')
  const publishWorkflow = workflow('publish')
  assert.equal(publishWorkflow.on.workflow_call.secrets.LINUX_GPG_PRIVATE_KEY.required, true)
  assert.equal(publishWorkflow.on.workflow_call.secrets.LINUX_GPG_PASSPHRASE.required, true)
  assert.equal(publishWorkflow.on.workflow_call.inputs.linux_gpg_fingerprint, undefined)
  assert.doesNotMatch(publish, /LINUX_GPG_FINGERPRINT/)
  assert.doesNotMatch(publish, /dist\/release\/kokorobox-process-router-\*\.cdx\.json/)
  assert.match(publish, /asset\.name\.startsWith\('kokorobox-process-router-'/)
  assert.match(publish, /dist\/release\/appcast-macos-\*\.xml/)
  assert.doesNotMatch(publish, /API_KEY|API_URL|AUR_SSH|delete-release-assets/)

  const signing = readFileSync('scripts/sign-linux-artifacts.sh', 'utf8')
  assert.match(signing, /rpmsign[\s\S]*--addsign/)
  assert.match(signing, /\.deb[\s\S]*\.asc/)
  assert.match(signing, /\.pkg\.tar\.zst[\s\S]*\.sig/)
  assert.match(signing, /SHA256SUMS\.asc/)
  assert.match(signing, /rpmkeys[\s\S]*--checksig/)
  assert.ok(existsSync('build/linux/kokorobox-linux-signing-key.asc'))
})

test('AUR publication uses KokoroBox package names and layouts', () => {
  const aurWorkflow = workflow('aur')
  const packages = aurWorkflow.jobs.publish.strategy.matrix.package
  assert.deepEqual(packages, ['kokorobox-rolling-bin', 'kokorobox-git', 'kokorobox-electron-git'])

  for (const packageName of packages) {
    const pkgbuild = readFileSync(`aur/${packageName}/PKGBUILD`, 'utf8')
    assert.match(pkgbuild, new RegExp(`^pkgname=${packageName}$`, 'm'))
    assert.match(pkgbuild, /\/opt\/kokorobox/)
  }
})

test('service release download tolerates GitHub asset publication delay', () => {
  const prepare = readFileSync('scripts/prepare.ts', 'utf8')
  assert.match(prepare, /name: 'kokorobox-service',[\s\S]*retry: 24,[\s\S]*retryDelayMs: 5000/)
  assert.match(
    prepare,
    /await new Promise<void>\(\(resolve\) => \{[\s\S]*?setTimeout\(resolve, task\.retryDelayMs\)[\s\S]*?\}\)/
  )
})

test('Windows taskbar traffic uses verified official TrafficMonitor packages and a source plugin', () => {
  assert.equal(TRAFFIC_MONITOR_VERSION, 'V1.86')
  assert.deepEqual(
    ['x64', 'arm64', 'ia32'].map((arch) => trafficMonitorAsset(arch).filename),
    [
      'TrafficMonitor_V1.86_x64_Lite.zip',
      'TrafficMonitor_V1.86_arm64ec_Lite.zip',
      'TrafficMonitor_V1.86_x86_Lite.zip'
    ]
  )
  assert.throws(() => trafficMonitorAsset('mips64'))
  assert.match(
    trafficMonitorDownloadUrl(trafficMonitorAsset('x64')),
    /^https:\/\/github\.com\/zhongyang219\/TrafficMonitor\/releases\/download\/V1\.86\//
  )

  const prepare = readFileSync('scripts/prepare.ts', 'utf8')
  assert.doesNotMatch(prepare, /xishang0128|sparkle-run\/releases\/download\/monitor/)
  assert.match(prepare, /TrafficMonitor SHA-256 mismatch/)
  assert.match(prepare, /portable_mode = true/)

  const plugin = readFileSync('native/windows/traffic-monitor/KokoroBoxTrafficPlugin.cpp', 'utf8')
  assert.match(plugin, /GET \/traffic HTTP\/1\.1/)
  assert.match(plugin, /\\\\\\\\\.\\\\pipe\\\\KokoroBox\\\\mihomo/)
  assert.doesNotMatch(plugin, /\\\\pipe\\\\Sparkle|Sparkle\.dll/)

  const runtime = readFileSync('src/main/resolve/trafficMonitor.ts', 'utf8')
  assert.match(runtime, /dataDir\(\), 'traffic-monitor'/)
  assert.match(runtime, /plugin_display_item=KokoroBoxUploadSpeed,KokoroBoxDownloadSpeed/)
  assert.match(runtime, /KOKOROBOX_MIHOMO_PIPE/)

  const buildWorkflow = workflow('build')
  assert.ok(buildWorkflow.jobs['validate-traffic-monitor-plugin'])
  assert.deepEqual(buildWorkflow.jobs.build.needs, ['validate', 'validate-traffic-monitor-plugin'])
  assert.ok(
    buildWorkflow.jobs.build.steps.some(
      (step: { name?: string }) => step.name === 'Build KokoroBox TrafficMonitor plugin'
    )
  )
})

test('Fedora validation gates the reusable build for x64 RPMs', () => {
  const job = workflow('build').jobs['fedora-rpm']
  assert.equal(job.needs, 'build')
  assert.equal(job['continue-on-error'], undefined)
  assert.equal(job['runs-on'], 'ubuntu-latest')
  assert.deepEqual(job.strategy.matrix.fedora, ['43', '44'])
  assert.equal(job.strategy.matrix.arch, undefined)
  assert.equal(job.strategy.matrix.include, undefined)
  const download = job.steps.find((step) => step.uses?.startsWith('actions/download-artifact@'))
  assert.equal(download.with.name, 'packages-ubuntu-latest-x64-rpm')
  const smoke = job.steps.find((step) => step.run?.includes('check-fedora-rpm.sh'))
  assert.ok(smoke)
  assert.equal(smoke['continue-on-error'], undefined)
  assert.match(smoke.run, /registry\.fedoraproject\.org\/fedora:/)
})

test('RPM declares cross-distribution SONAME requirements for Electron libraries', () => {
  const rpm = parse(readFileSync('electron-builder.yml', 'utf8')).rpm
  const dependencies = rpm.depends
  for (const dependency of [
    'libgbm.so.1()(64bit)',
    'libnotify.so.4()(64bit)',
    'libuuid.so.1()(64bit)'
  ]) {
    assert.ok(dependencies.includes(dependency), `Missing RPM dependency: ${dependency}`)
  }
  assert.ok(!dependencies.includes('libuuid'))
  assert.equal(rpm.afterRemove, 'build/linux/postrm')
  assert.ok(existsSync(rpm.afterRemove))
})

test('openSUSE Tumbleweed validation gates the reusable build for x64 RPMs', () => {
  const job = workflow('build').jobs['opensuse-rpm']
  assert.equal(job.needs, 'build')
  assert.equal(job['continue-on-error'], undefined)
  assert.equal(job['runs-on'], 'ubuntu-latest')
  assert.equal(job['timeout-minutes'], 30)
  const download = job.steps.find((step) => step.uses?.startsWith('actions/download-artifact@'))
  assert.equal(download.with.name, 'packages-ubuntu-latest-x64-rpm')
  const smoke = job.steps.find((step) => step.run?.includes('check-opensuse-rpm.sh'))
  assert.ok(smoke)
  assert.equal(smoke['continue-on-error'], undefined)
  assert.match(smoke.run, /registry\.opensuse\.org\/opensuse\/tumbleweed:latest/)
})

test('RPM renderer smoke test terminates the complete Electron process group', () => {
  const smokeTest = readFileSync('scripts/check-rpm-renderer.mjs', 'utf8')
  assert.match(smokeTest, /detached:\s*true/)
  assert.match(smokeTest, /process\.kill\(-child\.pid, 'SIGKILL'\)/)
  assert.match(smokeTest, /await Promise\.race\(\[closed, delay\(5000\)\]\)/)
  assert.match(smokeTest, /process\.exit\(0\)/)
})

test('CI macOS config loads through electron-builder and preserves PKG installation settings', async () => {
  const { getConfig, validateConfiguration } = createRequire(import.meta.url)(
    'app-builder-lib/out/util/config/config.js'
  )
  const config = await getConfig(process.cwd(), 'electron-builder.ci.yml')
  await validateConfiguration(config)
  assert.equal(config.appId, 'com.amamiyakokoro.app')
  assert.equal(config.productName, 'KokoroBox')
  assert.equal(config.win.executableName, 'KokoroBox')
  assert.equal(config.nsis.shortcutName, 'KokoroBox')
  assert.deepEqual(config.mac.target, ['dmg', 'pkg'])
  assert.equal(config.mac.identity, null)
  assert.equal(config.mac.notarize, false)
  assert.equal(
    config.mac.extendInfo.NSSystemExtensionUsageDescription,
    'KokoroBox uses a system extension to route only the applications you select.'
  )
  assert.equal(Array.isArray(config.mac.extendInfo), false)
  assert.equal(config.pkg.installLocation, '/Applications')
  assert.equal(config.pkg.isRelocatable, false)
  assert.equal(config.pkg.allowCurrentUserHome, false)
  assert.equal(config.dmg.sign, true)
  assert.equal(config.dmg.writeUpdateInfo, false)
  assert.notEqual(config.pkg.scripts, null)
  for (const file of ['build/pkg-scripts/preinstall', 'build/pkg-scripts/postinstall'])
    assert.ok(existsSync(file))
})

function publicationMock(
  options: {
    channel?: string
    draft?: boolean
    existingSha?: string
    missingTag?: boolean
    missingRelease?: boolean
    missingAsset?: boolean
    authFailure?: boolean
    refFailure?: number
  } = {}
) {
  const calls: string[] = []
  const channel = options.channel ?? 'stable'
  const env = {
    RELEASE_TAG: channel === 'rolling' ? 'rolling' : 'v2.26.8',
    RELEASE_CHANNEL: channel
  }
  const missing = () => {
    throw Object.assign(new Error('Not found'), { status: 404 })
  }
  const filenames = ['example.exe', 'latest.yml', 'SHA256SUMS', 'changelog.md']
  const assets = filenames
    .filter((name) => name !== 'changelog.md')
    .map((name, id) => ({ id, name, size: 10 }))
  assets.push({ id: 100, name: 'kokorobox-desktop-old.exe', size: 10 })
  const github = {
    rest: {
      repos: {
        listReleases: async () => {
          if (options.authFailure) throw Object.assign(new Error('Forbidden'), { status: 403 })
          if (options.missingRelease) return []
          return [{ id: 1, tag_name: env.RELEASE_TAG, draft: options.draft ?? true }]
        },
        getCommit: async () => {
          if (options.missingTag)
            throw Object.assign(new Error('No commit found for SHA'), { status: 422 })
          return { data: { sha: options.existingSha ?? sha } }
        },
        listReleaseAssets: async () => (options.missingAsset ? assets.slice(1) : assets),
        updateRelease: async () => {
          calls.push('publish')
        },
        deleteReleaseAsset: async () => {
          calls.push('delete-old-asset')
        }
      },
      git: {
        getRef: async ({ ref }: { ref: string }) => {
          assert.equal(ref, `tags/${env.RELEASE_TAG}`)
          if (options.refFailure)
            throw Object.assign(new Error('Ref lookup failed'), { status: options.refFailure })
          if (options.missingTag) return missing()
          return { data: { object: { sha: options.existingSha ?? sha } } }
        },
        createRef: async () => {
          calls.push('create-tag')
        },
        updateRef: async () => {
          calls.push('move-tag')
        }
      }
    },
    paginate: async (fn: () => Promise<unknown>) => fn()
  }
  const mockRequire = (name: string) => {
    assert.equal(name, 'node:fs')
    return { readdirSync: () => filenames, statSync: () => ({ size: 10 }) }
  }
  const run = async (name: string) => {
    const script = workflow('publish').jobs.publish.steps.find(
      (step: { name: string }) => step.name === name
    ).with.script
    const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor
    await new AsyncFunction('github', 'context', 'process', 'require', script)(
      github,
      { repo: { owner: 'test', repo: 'test' }, sha },
      { env },
      mockRequire
    )
  }
  return { run, calls }
}

test('publication creates a missing stable tag and does not overwrite published versions or changed tags', async () => {
  const first = publicationMock({ missingTag: true, missingRelease: true })
  await first.run('Check Publication Target')
  assert.deepEqual(first.calls, ['create-tag'])
  for (const options of [
    { draft: false },
    { existingSha: 'a'.repeat(40) },
    { authFailure: true }
  ]) {
    const mock = publicationMock(options)
    await assert.rejects(mock.run('Check Publication Target'))
    assert.deepEqual(mock.calls, [])
  }
})

test('first rolling publication creates an absent ref without a commit lookup or error fallback', async () => {
  const first = publicationMock({ channel: 'rolling', missingTag: true })
  await first.run('Check Publication Target')
  assert.deepEqual(first.calls, ['create-tag'])
  const existing = publicationMock({ channel: 'rolling', existingSha: 'a'.repeat(40) })
  await existing.run('Check Publication Target')
  assert.deepEqual(existing.calls, [])
  for (const channel of ['stable', 'rolling']) {
    for (const refFailure of [403, 422, 500]) {
      const failed = publicationMock({ channel, refFailure })
      await assert.rejects(failed.run('Check Publication Target'))
      assert.deepEqual(failed.calls, [])
    }
  }
})

test('a stable draft is published only after asset and tag checks; incomplete uploads stay unpublished', async () => {
  const complete = publicationMock()
  await complete.run('Finalize Release')
  assert.deepEqual(complete.calls, ['publish'])
  for (const options of [{ missingAsset: true }, { existingSha: 'a'.repeat(40) }]) {
    const mock = publicationMock(options)
    await assert.rejects(mock.run('Finalize Release'))
    assert.deepEqual(mock.calls, [])
  }
})

test('uploaded packages are verified through draft-aware release enumeration', async () => {
  await publicationMock().run('Verify Uploaded Packages')
  for (const options of [{ missingRelease: true }, { missingAsset: true }, { authFailure: true }])
    await assert.rejects(publicationMock(options).run('Verify Uploaded Packages'))
})

test('rolling tags move and old assets are deleted only after complete uploads', async () => {
  const complete = publicationMock({ channel: 'rolling' })
  await complete.run('Finalize Release')
  assert.deepEqual(complete.calls, ['move-tag', 'delete-old-asset'])
  const incomplete = publicationMock({ channel: 'rolling', missingAsset: true })
  await assert.rejects(incomplete.run('Finalize Release'))
  assert.deepEqual(incomplete.calls, [])
})

test('updater metadata is uploaded only after verifying all replacement packages', async () => {
  const steps = workflow('publish').jobs.publish.steps
  const names = steps.map((step: { name: string }) => step.name)
  const releaseFiles = steps.find((step: { name: string }) => step.name === 'Upload Release Assets')
    .with.files
  assert.ok(names.indexOf('Verify Uploaded Packages') < names.indexOf('Upload Update Metadata'))
  assert.ok(names.indexOf('Upload Update Metadata') < names.indexOf('Finalize Release'))
  assert.ok(names.indexOf('Sign Linux Release Packages') < names.indexOf('Upload Release Assets'))
  assert.match(releaseFiles, /appcast-macos-\*\.xml/)
  assert.match(releaseFiles, /SHA256SUMS\*/)
  assert.match(releaseFiles, /kokorobox-linux-signing-key\.asc/)
  assert.doesNotMatch(releaseFiles, /latest.yml/)
  const missing = publicationMock({ missingAsset: true })
  await assert.rejects(missing.run('Verify Uploaded Packages'))
})
