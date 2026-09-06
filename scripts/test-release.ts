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
  releaseTargets,
  stageArtifact,
  targetId
} from './release-artifacts.ts'
import { compareVersions, normalizeVersion, planRelease } from './release-plan.ts'

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

test('build matrix exactly matches the 12 required release artifacts', () => {
  const build = workflow('build')
  assert.deepEqual(build.jobs.build.strategy.matrix.include, releaseTargets)
  assert.equal(new Set(releaseTargets.map(targetId)).size, 12)
  assert.equal(new Set(releaseTargets.map((target) => artifactName(target, '2.26.8'))).size, 12)
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
  assert.throws(() =>
    artifactName({ os: 'windows-latest', arch: 'ia32', format: 'nsis' }, '2.26.8')
  )
  assert.throws(() => artifactName(releaseTargets[0], '../../bad'))
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
  for (const file of [
    '.github/workflows/build.yml',
    'scripts/prepare.ts',
    'scripts/updater.ts',
    'pnpm-workspace.yaml'
  ]) {
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
              value: 'cf2aee3de37c56d1c530f58295ff6c7521472129'
            },
            {
              name: 'kokorobox:windivert-archive-sha256',
              value: '63cb41763bb4b20f600b6de04e991a9c2be73279e317d4d82f237b150c5f3f15'
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
                .digest('hex')
            }
          : undefined
      stageArtifact(
        target,
        version,
        sha,
        packages,
        source,
        signing,
        target.os === 'windows-latest' && target.arch === 'x64' && target.format === 'nsis'
          ? processRouterSbom
          : undefined
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
    assert.match(latest.changelog, /Developer ID-signed, notarized by Apple/)
    assert.equal(readdirSync(output).length, 16)
    const lines = readFileSync(path.join(output, 'SHA256SUMS'), 'utf8').trim().split('\n')
    assert.equal(lines.length, 13)
    for (const line of lines) {
      const [digest, name] = line.split('  ')
      assert.equal(
        digest,
        createHash('sha256')
          .update(readFileSync(path.join(output, name)))
          .digest('hex')
      )
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

test('workflows gate publication on all builds and do not invoke upstream-only services', () => {
  for (const name of ['release', 'rolling']) {
    const config = workflow(name)
    assert.deepEqual(config.jobs.publish.needs, ['prepare', 'build'])
    assert.equal(config.jobs.build.uses, './.github/workflows/build.yml')
    assert.equal(config.jobs.publish.uses, './.github/workflows/publish.yml')
    assert.equal(config.concurrency['cancel-in-progress'], false)
    assert.equal(config.jobs.aur, undefined)
    assert.equal(config.jobs['update-version'], undefined)
  }
  const build = workflow('build')
  assert.equal(build.jobs.build.strategy['fail-fast'], false)
  assert.equal(build.jobs.build.needs, 'validate')
  assert.equal(build.permissions.contents, 'read')
  const ciMac = parse(readFileSync('electron-builder.ci.yml', 'utf8'))
  assert.equal(ciMac.mac.identity, null)
  assert.equal(ciMac.mac.notarize, false)
  assert.equal(parse(readFileSync('electron-builder.yml', 'utf8')).linux.executableName, 'sparkle')
  const publish = readFileSync('.github/workflows/publish.yml', 'utf8')
  assert.match(publish, /kokorobox-process-router-\*\.cdx\.json/)
  assert.doesNotMatch(publish, /API_KEY|API_URL|AUR_SSH|delete-release-assets/)
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
  const download = job.steps.find((step) => step.uses?.startsWith('actions/download-artifact@'))
  assert.equal(download.with.name, 'packages-ubuntu-latest-x64-rpm')
  const smoke = job.steps.find((step) => step.run?.includes('check-opensuse-rpm.sh'))
  assert.ok(smoke)
  assert.equal(smoke['continue-on-error'], undefined)
  assert.match(smoke.run, /registry\.opensuse\.org\/opensuse\/tumbleweed:latest/)
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
  assert.deepEqual(config.mac.target, ['pkg'])
  assert.equal(config.mac.identity, null)
  assert.equal(config.mac.notarize, false)
  assert.equal(config.pkg.installLocation, '/Applications')
  assert.equal(config.pkg.allowCurrentUserHome, false)
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
  assert.ok(names.indexOf('Verify Uploaded Packages') < names.indexOf('Upload Update Metadata'))
  assert.ok(names.indexOf('Upload Update Metadata') < names.indexOf('Finalize Release'))
  assert.doesNotMatch(
    steps.find((step: { name: string }) => step.name === 'Upload Release Assets').with.files,
    /latest.yml/
  )
  const missing = publicationMock({ missingAsset: true })
  await assert.rejects(missing.run('Verify Uploaded Packages'))
})
