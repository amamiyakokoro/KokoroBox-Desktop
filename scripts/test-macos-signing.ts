import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { parse } from 'yaml'
import {
  appleSecrets,
  assertAccepted,
  assertDeveloperId,
  assertSystemExtensionHostEntitlements,
  assertProvisioningProfilePermissions,
  cleanupSigning,
  decodeCertificate,
  runCommand,
  sanitizedChildEnvironment,
  signMacRelease,
  signingConfig,
  kokoroBoxAppleTeamId,
  validateSigningEnvironment
} from './macos-signing.ts'
import type { CommandRunner } from './macos-signing.ts'
import { artifactName, stageArtifact, validateMacReceipt } from './release-artifacts.ts'

const teamId = kokoroBoxAppleTeamId
const sha = '1234567890abcdef1234567890abcdef12345678'
const submissionId = '12345678-1234-1234-1234-123456789abc'
const details = `Authority=Developer ID Application: Test (${teamId})\nTeamIdentifier=${teamId}\nCodeDirectory flags=0x10000(runtime)\nTimestamp=Sep 5, 2026\n`
const safeHostEntitlements = `
<key>com.apple.developer.system-extension.install</key><true/>
<key>com.apple.security.cs.allow-jit</key><true/>
`

function fixture(callback: (env: NodeJS.ProcessEnv, directory: string) => void) {
  const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'kokorobox-signing-test-')))
  mkdirSync(path.join(directory, 'dist'))
  const env = {
    CSC_LINK: Buffer.from('fake application certificate').toString('base64'),
    CSC_INSTALLER_LINK: Buffer.from('fake installer certificate').toString('base64'),
    CSC_KEY_PASSWORD: 'fake-application-password',
    CSC_INSTALLER_KEY_PASSWORD: 'fake-installer-password',
    APPLE_ID: 'test@example.invalid',
    APPLE_APP_SPECIFIC_PASSWORD: 'fake-notary-password',
    APPLE_TEAM_ID: teamId,
    MACOS_APP_PROVISIONING_PROFILE: Buffer.from('fake app profile').toString('base64'),
    MACOS_EXTENSION_PROVISIONING_PROFILE: Buffer.from('fake extension profile').toString('base64'),
    TARGET_ARCH: 'arm64',
    RELEASE_VERSION: '2.26.8',
    GITHUB_SHA: sha,
    RUNNER_TEMP: directory,
    GITHUB_ENV: path.join(directory, 'github-env'),
    GITHUB_REPOSITORY: 'amamiyakokoro/KokoroBox-Desktop',
    GITHUB_REF: 'refs/heads/master',
    GITHUB_EVENT_NAME: 'push',
    RUNNER_ENVIRONMENT: 'github-hosted'
  }
  try {
    callback(env, directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function mockRunner(env: NodeJS.ProcessEnv, projectDir: string, failure?: string) {
  const calls: string[] = []
  const run: CommandRunner = (label, command, args, childEnv) => {
    calls.push(label)
    for (const secret of appleSecrets)
      assert.equal(
        childEnv[secret],
        undefined,
        `Secret forwarded to subprocess environment: ${secret}`
      )
    if (label === failure) throw new Error(`${label} failed`)
    if (label === 'Read Keychain search list') return '"/tmp/original.keychain-db"\n'
    if (label === 'Create temporary Keychain') writeFileSync(args.at(-1)!, 'fake keychain')
    if (label === 'Find Developer ID signing identity') {
      return `  1) 1234567890ABCDEF1234567890ABCDEF12345678 "Developer ID Application: Test (${teamId})"\n`
    }
    if (label.startsWith('Import ') && label.endsWith(' certificate'))
      assert.equal(statSync(args[1]).mode & 0o777, 0o600)
    if (label === 'Sign App and PKG') {
      assert.equal(command, process.execPath)
      assert.ok(childEnv.CSC_KEYCHAIN)
      assert.equal(childEnv.CSC_IDENTITY_AUTO_DISCOVERY, 'true')
      const config = JSON.parse(readFileSync(args.at(-1)!, 'utf8'))
      assert.equal(config.forceCodeSigning, true)
      assert.equal(config.mac.identity, teamId)
      assert.equal(config.pkg.identity, teamId)
      assert.equal(statSync(config.mac.provisioningProfile).mode & 0o777, 0o644)
      assert.equal(
        statSync(childEnv.KOKOROBOX_EXTENSION_PROVISIONING_PROFILE_PATH!).mode & 0o777,
        0o644
      )
      const name = artifactName(
        { os: 'macos-latest', arch: env.TARGET_ARCH!, format: 'pkg' },
        env.RELEASE_VERSION!
      )
      const appPath = path.join(
        projectDir,
        'dist',
        env.TARGET_ARCH === 'arm64' ? 'mac-arm64' : 'mac',
        'KokoroBox.app'
      )
      const extensionContents = path.join(
        appPath,
        'Contents/Library/SystemExtensions/com.amamiyakokoro.app.proxy-extension.systemextension/Contents'
      )
      mkdirSync(extensionContents, { recursive: true })
      writeFileSync(path.join(appPath, 'Contents/embedded.provisionprofile'), 'app profile', {
        mode: 0o644
      })
      writeFileSync(
        path.join(extensionContents, 'embedded.provisionprofile'),
        'extension profile',
        {
          mode: 0o644
        }
      )
      writeFileSync(path.join(projectDir, 'dist', name), 'signed package before stapling')
    }
    if (label === 'Inspect App/helper signing identity') return details
    if (label === 'Inspect App entitlements') return safeHostEntitlements
    if (label === 'Launch signed App AMFI probe') return 'kokorobox-amfi-probe-ok\n'
    if (label.includes('PKG signature'))
      return `Developer ID Installer: Test (${teamId})\nSigned with a trusted timestamp`
    if (label === 'Submit PKG for notarization') {
      assert.ok(args.includes('--wait'))
      assert.ok(args.includes('--keychain-profile'))
      assert.ok(!args.includes('--password'))
      return JSON.stringify({
        id: submissionId,
        status: failure === 'Rejected' ? 'Invalid' : 'Accepted'
      })
    }
    if (label === 'Staple PKG ticket')
      writeFileSync(args.at(-1)!, 'signed package with stapled ticket')
    return ''
  }
  return { calls, run }
}

test('all signing credentials are required and signing rejects untrusted contexts', () => {
  fixture((env) => {
    validateSigningEnvironment(env)
    for (const name of appleSecrets)
      assert.throws(() => validateSigningEnvironment({ ...env, [name]: '' }), new RegExp(name))
    for (const override of [
      { GITHUB_EVENT_NAME: 'pull_request' },
      { GITHUB_EVENT_NAME: 'pull_request_target' },
      { GITHUB_REF: 'refs/heads/untrusted' },
      { GITHUB_REPOSITORY: 'someone/fork' },
      { RUNNER_ENVIRONMENT: 'self-hosted' },
      { TARGET_ARCH: 'universal' },
      { APPLE_TEAM_ID: 'wrong' }
    ])
      assert.throws(() => validateSigningEnvironment({ ...env, ...override }))
    for (const ref of [
      'refs/tags/v2.26.8',
      'refs/tags/2.26.8',
      'refs/tags/v2.26.9-1',
      'refs/tags/2.26.9-1'
    ])
      validateSigningEnvironment({ ...env, GITHUB_REF: ref })
    for (const ref of [
      'refs/tags/2.26.9-01',
      'refs/tags/2.26.9-beta',
      'refs/tags/2.26.9-rolling-1234567',
      'refs/tags/2.26.9-1/extra',
      'refs/tags/2.26.9-1\n'
    ])
      assert.throws(() => validateSigningEnvironment({ ...env, GITHUB_REF: ref }))
  })
})

test('certificate input accepts Base64, not local paths or download URLs', () => {
  assert.equal(decodeCertificate(' ZmFrZQ==\n').toString(), 'fake')
  for (const value of ['', 'https://example.invalid/key.p12', '/tmp/certificate.p12', '!!!!', 'a'])
    assert.throws(() => decodeCertificate(value))
})

test('child process environment omits credentials and process failures do not expose argv or output', () => {
  fixture((env) => {
    const cleaned = sanitizedChildEnvironment({ ...env, GH_TOKEN: 'fake-token', DEBUG: '*' })
    for (const key of [...appleSecrets, 'GH_TOKEN', 'DEBUG']) assert.equal(cleaned[key], undefined)
    assert.throws(
      () =>
        runCommand(
          'Test command',
          process.execPath,
          ['-e', 'process.stderr.write("fake-secret"); process.exit(1)'],
          cleaned
        ),
      (error) => {
        assert.doesNotMatch(String(error), /fake-secret|process.stderr|fake-token/)
        return true
      }
    )
  })
})

test('Developer ID checks reject ad-hoc, wrong-team, unhardened and untimestamped signatures', () => {
  assertDeveloperId(details, teamId)
  for (const text of [
    details.replace(teamId, 'WRONGTEAM0').replace(teamId, 'WRONGTEAM0'),
    details.replace('runtime', 'none'),
    details.replace('Timestamp=', 'Signed Time='),
    details.replace('Authority=Developer ID Application:', 'Signature=adhoc')
  ]) {
    assert.throws(() => assertDeveloperId(text, teamId))
  }
})

test('System Extension host rejects Hardened Runtime relaxations that make AMFI kill Electron', () => {
  assertSystemExtensionHostEntitlements(safeHostEntitlements)
  assertSystemExtensionHostEntitlements(readFileSync('build/entitlements.mac.plist', 'utf8'))
  for (const forbidden of [
    'com.apple.security.cs.allow-dyld-environment-variables',
    'com.apple.security.cs.allow-unsigned-executable-memory',
    'com.apple.security.cs.disable-executable-page-protection',
    'com.apple.security.cs.disable-library-validation'
  ]) {
    assert.throws(() => assertSystemExtensionHostEntitlements(`${safeHostEntitlements}${forbidden}`))
  }
  assert.throws(() =>
    assertSystemExtensionHostEntitlements(
      '<key>com.apple.developer.system-extension.install</key><true/>'
    )
  )
  assert.throws(() =>
    assertSystemExtensionHostEntitlements('<key>com.apple.security.cs.allow-jit</key><true/>')
  )
})

test('embedded provisioning profiles remain readable after a root-owned PKG install', () => {
  fixture((_env, directory) => {
    const appPath = path.join(directory, 'KokoroBox.app')
    const extensionContents = path.join(
      appPath,
      'Contents/Library/SystemExtensions/com.amamiyakokoro.app.proxy-extension.systemextension/Contents'
    )
    mkdirSync(extensionContents, { recursive: true })
    const appProfile = path.join(appPath, 'Contents/embedded.provisionprofile')
    const extensionProfile = path.join(extensionContents, 'embedded.provisionprofile')
    writeFileSync(appProfile, 'app profile', { mode: 0o644 })
    writeFileSync(extensionProfile, 'extension profile', { mode: 0o644 })
    assert.doesNotThrow(() => assertProvisioningProfilePermissions(appPath))
    chmodSync(extensionProfile, 0o600)
    assert.throws(() => assertProvisioningProfilePermissions(appPath), /mode 0644/)
  })
})

test('notarization must return Accepted with a valid submission ID', () => {
  assert.throws(
    () => assertAccepted('not-json-fake-secret'),
    (error) => {
      assert.doesNotMatch(String(error), /not-json-fake-secret/)
      return true
    }
  )
  assert.throws(() => assertAccepted('null'))
  assert.equal(
    assertAccepted(JSON.stringify({ status: 'Accepted', id: submissionId })),
    submissionId
  )
  for (const value of [
    { status: 'Invalid', id: submissionId },
    { status: 'In Progress', id: submissionId },
    { status: 'Accepted' },
    { status: 'Accepted', id: '-'.repeat(36) }
  ])
    assert.throws(() => assertAccepted(JSON.stringify(value)))
})

for (const arch of ['x64', 'arm64']) {
  test(`${arch}: signs, notarizes, staples, verifies, hashes the final package and cleans credentials`, () => {
    fixture((env, directory) => {
      env.TARGET_ARCH = arch
      const mock = mockRunner(env, directory)
      signMacRelease(env, mock.run, directory)
      const receipt = JSON.parse(
        readFileSync(path.join(directory, 'dist', `macos-signing-${arch}.json`), 'utf8')
      )
      assert.equal(receipt.status, 'apple-notarized')
      assert.equal(receipt.notarizationId, submissionId)
      assert.equal(
        receipt.checksum,
        createHash('sha256').update('signed package with stapled ticket').digest('hex')
      )
      assert.equal(mock.calls.filter((label) => label === 'Verify App/helper signature').length, 6)
      assert.ok(
        mock.calls.indexOf('Submit PKG for notarization') < mock.calls.indexOf('Staple PKG ticket')
      )
      assert.ok(
        mock.calls.indexOf('Validate PKG ticket') < mock.calls.indexOf('Assess PKG with Gatekeeper')
      )
      assert.deepEqual(mock.calls.slice(-2), [
        'Restore Keychain search list',
        'Delete temporary signing Keychain'
      ])
      assert.equal(
        readdirSync(directory).some((name) => name.startsWith('kokorobox-signing-')),
        false
      )
      const recorded = readFileSync(env.GITHUB_ENV!, 'utf8')
      for (const key of appleSecrets) assert.ok(!recorded.includes(env[key]!))
      const target = { os: 'macos-latest', arch, format: 'pkg' }
      stageArtifact(
        target,
        '2.26.8',
        sha,
        path.join(directory, 'dist'),
        path.join(directory, 'staged'),
        receipt
      )
    })
  })
}

for (const failure of [
  'Import application certificate',
  'Validate Apple notarization credentials',
  'Sign App and PKG',
  'Inspect App entitlements',
  'Launch signed App AMFI probe',
  'Submit PKG for notarization',
  'Rejected',
  'Staple PKG ticket',
  'Validate PKG ticket',
  'Assess PKG with Gatekeeper'
]) {
  test(`${failure}: fails closed, cleans private material, and never produces a verification receipt`, () => {
    fixture((env, directory) => {
      const mock = mockRunner(env, directory, failure)
      assert.throws(() => signMacRelease(env, mock.run, directory))
      assert.equal(existsSync(path.join(directory, 'dist', 'macos-signing-arm64.json')), false)
      assert.equal(
        readdirSync(directory).some((name) => name.startsWith('kokorobox-signing-')),
        false
      )
      assert.ok(mock.calls.includes('Restore Keychain search list'))
      if (failure === 'Rejected') assert.ok(!mock.calls.includes('Staple PKG ticket'))
    })
  })
}

test('cleanup is idempotent and refuses broad or unrelated directories', () => {
  fixture((env, directory) => {
    const run: CommandRunner = () => {
      throw new Error('Must not execute')
    }
    cleanupSigning(undefined, env, run)
    cleanupSigning(path.join(directory, 'kokorobox-signing-absent'), env, run)
    for (const target of [
      directory,
      '/',
      path.join(directory, 'dist'),
      '/tmp/kokorobox-signing-other'
    ])
      assert.throws(() => cleanupSigning(target, env, run))
  })
})

test('unsigned or modified macOS artifacts cannot be staged with a stale receipt', () => {
  assert.throws(() => validateMacReceipt(undefined, '2.26.8', sha, 'config.pkg', 'abc'))
  const receipt = {
    status: 'apple-notarized' as const,
    teamId,
    notarizationId: submissionId,
    version: '2.26.8',
    sha,
    filename: 'config.pkg',
    checksum: 'abc'
  }
  validateMacReceipt(receipt, '2.26.8', sha, 'config.pkg', 'abc')
  assert.throws(() => validateMacReceipt(receipt, '2.26.8', sha, 'config.pkg', 'changed'))
  assert.throws(() =>
    validateMacReceipt(
      { ...receipt, status: 'unsigned' } as never,
      '2.26.8',
      sha,
      'config.pkg',
      'abc'
    )
  )
})

test('generated signing config passes electron-builder validation with required binaries', async () => {
  const { getConfig, validateConfiguration } = createRequire(import.meta.url)(
    'app-builder-lib/out/util/config/config.js'
  )
  const config = await getConfig(process.cwd(), undefined, signingConfig(process.cwd(), teamId))
  await validateConfiguration(config)
  assert.equal(config.forceCodeSigning, true)
  assert.equal(config.mac.binaries.length, 4)
  assert.ok(
    config.mac.binaries.includes(
      'Contents/Resources/files/macos-app-routing/kokorobox-app-routing.node'
    )
  )
  assert.match(config.afterPack, /macos-after-pack\.cjs$/)
  assert.equal(config.mac.entitlementsInherit, 'build/entitlements.mac.helper.plist')
  assert.deepEqual(config.mac.signIgnore, [
    'Contents/Library/SystemExtensions/com.amamiyakokoro.app.proxy-extension.systemextension'
  ])
  const afterPack = readFileSync('scripts/macos-after-pack.cjs', 'utf8')
  assert.doesNotMatch(afterPack, /entitlements\.mac\.bridge|app-routing-bridge/)
  assert.match(afterPack, /extensionIdentifier !== extensionServiceName/)
  assert.match(afterPack, /bundle name must match its identifier/)
  assert.match(afterPack, /plistString\(appInfo, 'NSSystemExtensionUsageDescription'\)/)
  assert.match(afterPack, /plistString\(extensionInfo, 'NSSystemExtensionUsageDescription'\)/)
  assert.match(afterPack, /host and System Extension must include usage descriptions/)
  assert.equal(config.pkg.identity, teamId)
})

test('both callers forward only the required signing secrets and non-macOS steps do not receive them', () => {
  for (const file of ['release', 'rolling']) {
    const config = parse(readFileSync(`.github/workflows/${file}.yml`, 'utf8'))
    assert.deepEqual(Object.keys(config.jobs.build.secrets).sort(), [...appleSecrets].sort())
    assert.equal(config.jobs.publish.secrets, undefined)
  }
  const config = parse(readFileSync('.github/workflows/build.yml', 'utf8'))
  assert.equal(config.jobs.build['runs-on'], '${{ matrix.runner || matrix.os }}')
  const macTargets = config.jobs.build.strategy.matrix.include.filter(
    (target: { os: string }) => target.os === 'macos-latest'
  )
  assert.deepEqual(
    macTargets.map((target: { arch: string; runner: string }) => [target.arch, target.runner]),
    [
      ['x64', 'macos-15-intel'],
      ['arm64', 'macos-latest']
    ]
  )
  for (const step of config.jobs.build.steps) {
    if (JSON.stringify(step.env ?? {}).includes('secrets.')) {
      assert.equal(step.name, 'Sign and Notarize macOS PKG')
      assert.equal(step.if, "matrix.os == 'macos-latest'")
    }
  }
  assert.match(config.jobs.build.if, /github.repository == 'amamiyakokoro\/KokoroBox-Desktop'/)
  const cleanup = config.jobs.build.steps.find(
    (step: { name: string }) => step.name === 'Clean Up macOS Signing Credentials'
  )
  assert.match(cleanup.if, /always\(\)/)
})
