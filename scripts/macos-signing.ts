import { spawnSync } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { artifactName } from './release-artifacts.ts'

export const appleSecrets = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'CSC_INSTALLER_LINK',
  'CSC_INSTALLER_KEY_PASSWORD',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID'
] as const

export type CommandRunner = (
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout?: number
) => string
export const runCommand: CommandRunner = (label, command, args, env, timeout = 120_000) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (result.error || result.status !== 0) {
    // Process errors contain argv (including passwords). Never propagate or log them.
    throw new Error(
      `${label} failed. Check the credential/configuration for this step; command arguments and raw output are withheld.`
    )
  }
  return command === '/usr/bin/codesign' ? result.stdout + result.stderr : result.stdout
}

export function validateSigningEnvironment(env: NodeJS.ProcessEnv) {
  for (const name of appleSecrets)
    if (!env[name]?.trim()) throw new Error(`Missing GitHub Secret: ${name}`)
  if (!/^[A-Z0-9]{10}$/.test(env.APPLE_TEAM_ID!))
    throw new Error('APPLE_TEAM_ID must contain 10 uppercase letters/digits')
  if (!['x64', 'arm64'].includes(env.TARGET_ARCH ?? ''))
    throw new Error('Unsupported macOS architecture')
  if (!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '')) throw new Error('Invalid source commit SHA')
  if (!env.RUNNER_TEMP || !path.isAbsolute(env.RUNNER_TEMP))
    throw new Error('RUNNER_TEMP must be an absolute path')
  if (!env.GITHUB_ENV) throw new Error('GITHUB_ENV is required for cancellation cleanup')
  const trustedRef =
    env.GITHUB_REF === 'refs/heads/master' ||
    /^refs\/tags\/v?\d+\.\d+\.\d+$/.test(env.GITHUB_REF ?? '')
  if (
    env.GITHUB_REPOSITORY !== 'amamiyakokoro/KokoroBox-Desktop' ||
    !trustedRef ||
    !['push', 'workflow_dispatch', 'schedule'].includes(env.GITHUB_EVENT_NAME ?? '') ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted'
  ) {
    throw new Error('Signing is restricted to trusted release refs on GitHub-hosted runners')
  }
}

export function decodeCertificate(value: string): Buffer {
  const encoded = value.replace(/\s/g, '')
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error('Certificate must be Base64-encoded PKCS#12, not a URL or path')
  const decoded = Buffer.from(encoded, 'base64')
  if (
    decoded.length === 0 ||
    decoded.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')
  )
    throw new Error('Invalid certificate Base64 encoding')
  return decoded
}

export function signingConfig(projectDir: string, teamId: string) {
  return {
    extends: path.join(projectDir, 'electron-builder.yml'),
    forceCodeSigning: true,
    mac: {
      identity: teamId,
      type: 'distribution',
      hardenedRuntime: true,
      // The final PKG is explicitly notarized below; never rely on optional auto-notarization.
      notarize: false,
      binaries: [
        'Contents/Resources/sidecar/mihomo',
        'Contents/Resources/sidecar/mihomo-alpha',
        'Contents/Resources/files/sparkle-service'
      ]
    },
    pkg: { identity: teamId }
  }
}

export function sanitizedChildEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // The packaging subprocess does not need certificate blobs, passwords, or Apple account credentials.
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) => !/^(CSC_|WIN_CSC_|APPLE_|GH_TOKEN$|GITHUB_TOKEN$|DEBUG$)/.test(key)
    )
  )
}

function cleanupPath(directory: string, runnerTemp: string): string {
  const temp = realpathSync(runnerTemp)
  const resolved = path.resolve(directory)
  if (
    path.dirname(resolved) !== temp ||
    !/^kokorobox-signing-[A-Za-z0-9]+$/.test(path.basename(resolved))
  )
    throw new Error('Refusing cleanup outside the dedicated signing directory')
  if (
    existsSync(resolved) &&
    (!lstatSync(resolved).isDirectory() || lstatSync(resolved).isSymbolicLink())
  )
    throw new Error('Refusing cleanup of an unexpected signing path')
  return resolved
}

export function cleanupSigning(
  directory: string | undefined,
  env: NodeJS.ProcessEnv,
  run: CommandRunner = runCommand
) {
  if (!directory) return
  const resolved = cleanupPath(directory, env.RUNNER_TEMP ?? '')
  if (!existsSync(resolved)) return
  const childEnv = sanitizedChildEnvironment(env)
  const stateFile = path.join(resolved, 'keychains.json')
  const errors: string[] = []
  if (existsSync(stateFile)) {
    const original = JSON.parse(readFileSync(stateFile, 'utf8')) as string[]
    try {
      run(
        'Restore Keychain search list',
        '/usr/bin/security',
        ['list-keychains', '-d', 'user', '-s', ...original],
        childEnv
      )
    } catch {
      errors.push('restore Keychain search list')
    }
  }
  const keychain = path.join(resolved, 'signing.keychain-db')
  if (existsSync(keychain)) {
    try {
      run(
        'Delete temporary signing Keychain',
        '/usr/bin/security',
        ['delete-keychain', keychain],
        childEnv
      )
    } catch {
      errors.push('delete temporary Keychain')
    }
  }
  rmSync(resolved, { recursive: true, force: true })
  if (errors.length) throw new Error(`Signing cleanup could not ${errors.join(' and ')}`)
}

export function assertDeveloperId(details: string, teamId: string) {
  if (
    !details.includes(`TeamIdentifier=${teamId}`) ||
    !details.includes('Authority=Developer ID Application:') ||
    !details.includes('runtime') ||
    !/^Timestamp=/m.test(details)
  ) {
    throw new Error(
      'App/helper signature is not a timestamped, hardened Developer ID signature from the expected team'
    )
  }
}

export function assertAccepted(response: string): string {
  let result: { status?: string; id?: string }
  try {
    result = JSON.parse(response)
    if (!result || typeof result !== 'object') throw new Error('Invalid response')
  } catch {
    throw new Error('Apple notarization returned an invalid JSON response; raw output is withheld')
  }
  if (result.status !== 'Accepted')
    throw new Error(
      `Apple notarization was not accepted (${['Invalid', 'Rejected', 'In Progress'].includes(result.status ?? '') ? result.status : 'unknown status'})`
    )
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(result.id ?? ''))
    throw new Error('Missing notarization submission ID')
  return result.id as string
}

export function signMacRelease(
  env: NodeJS.ProcessEnv,
  run: CommandRunner = runCommand,
  projectDir = process.cwd()
) {
  validateSigningEnvironment(env)
  const arch = env.TARGET_ARCH!
  const version = env.RELEASE_VERSION ?? ''
  const filename = artifactName({ os: 'macos-latest', arch, format: 'pkg' }, version)
  const appCertificate = decodeCertificate(env.CSC_LINK!)
  const installerCertificate = decodeCertificate(env.CSC_INSTALLER_LINK!)
  const teamId = env.APPLE_TEAM_ID!
  const directory = mkdtempSync(path.join(realpathSync(env.RUNNER_TEMP!), 'kokorobox-signing-'))
  const keychain = path.join(directory, 'signing.keychain-db')
  const profile = 'kokorobox-notary'
  const childEnv = sanitizedChildEnvironment(env)
  const receiptFile = path.join(projectDir, 'dist', `macos-signing-${arch}.json`)
  if (existsSync(receiptFile)) rmSync(receiptFile)
  // Record only the non-secret directory before importing credentials, for an always() cleanup step.
  appendFileSync(env.GITHUB_ENV!, `MACOS_SIGNING_DIR=${directory}\n`)
  try {
    console.log('Importing Developer ID certificates into a temporary Keychain')
    const original = run(
      'Read Keychain search list',
      '/usr/bin/security',
      ['list-keychains', '-d', 'user'],
      childEnv
    )
      .split('\n')
      .map((line) => line.trim().replace(/^"|"$/g, ''))
      .filter(Boolean)
    writeFileSync(path.join(directory, 'keychains.json'), JSON.stringify(original), { mode: 0o600 })
    const password = randomBytes(32).toString('base64url')
    run(
      'Create temporary Keychain',
      '/usr/bin/security',
      ['create-keychain', '-p', password, keychain],
      childEnv
    )
    run(
      'Unlock temporary Keychain',
      '/usr/bin/security',
      ['unlock-keychain', '-p', password, keychain],
      childEnv
    )
    run(
      'Configure temporary Keychain',
      '/usr/bin/security',
      ['set-keychain-settings', '-lut', '21600', keychain],
      childEnv
    )
    run(
      'Add temporary Keychain',
      '/usr/bin/security',
      ['list-keychains', '-d', 'user', '-s', keychain, ...original],
      childEnv
    )
    for (const [name, data, certificatePassword] of [
      ['application', appCertificate, env.CSC_KEY_PASSWORD!],
      ['installer', installerCertificate, env.CSC_INSTALLER_KEY_PASSWORD!]
    ] as const) {
      const file = path.join(directory, `${name}.p12`)
      writeFileSync(file, data, { mode: 0o600 })
      run(
        `Import ${name} certificate`,
        '/usr/bin/security',
        [
          'import',
          file,
          '-k',
          keychain,
          '-P',
          certificatePassword,
          '-T',
          '/usr/bin/codesign',
          '-T',
          '/usr/bin/productbuild'
        ],
        childEnv
      )
      rmSync(file)
    }
    run(
      'Authorize Apple signing tools',
      '/usr/bin/security',
      ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, keychain],
      childEnv
    )
    run(
      'Validate Apple notarization credentials',
      '/usr/bin/xcrun',
      [
        'notarytool',
        'store-credentials',
        profile,
        '--keychain',
        keychain,
        '--apple-id',
        env.APPLE_ID!,
        '--team-id',
        teamId,
        '--password',
        env.APPLE_APP_SPECIFIC_PASSWORD!
      ],
      childEnv
    )
    const configFile = path.join(directory, 'electron-builder.json')
    writeFileSync(configFile, JSON.stringify(signingConfig(projectDir, teamId)), { mode: 0o600 })
    console.log(`Signing macOS ${arch} application, helpers and PKG`)
    run(
      'Sign App and PKG',
      process.execPath,
      [
        path.join(projectDir, 'node_modules/electron-builder/cli.js'),
        '--publish',
        'never',
        '--mac',
        'pkg',
        `--${arch}`,
        '--config',
        configFile
      ],
      { ...childEnv, CSC_KEYCHAIN: keychain, CSC_IDENTITY_AUTO_DISCOVERY: 'true' },
      30 * 60_000
    )
    const appPath = path.join(
      projectDir,
      'dist',
      arch === 'arm64' ? 'mac-arm64' : 'mac',
      'KokoroBox.app'
    )
    const pkgPath = path.join(projectDir, 'dist', filename)
    for (const file of [
      appPath,
      ...signingConfig(projectDir, teamId).mac.binaries.map((file) => path.join(appPath, file))
    ]) {
      run(
        'Verify App/helper signature',
        '/usr/bin/codesign',
        ['--verify', '--deep', '--strict', file],
        childEnv
      )
      // codesign writes display information to stderr; the runner captures both streams.
      const details = run(
        'Inspect App/helper signing identity',
        '/usr/bin/codesign',
        ['--display', '--verbose=4', file],
        childEnv
      )
      assertDeveloperId(details, teamId)
    }
    const pkgSignature = run(
      'Verify PKG signature',
      '/usr/sbin/pkgutil',
      ['--check-signature', pkgPath],
      childEnv
    )
    if (!pkgSignature.includes('Developer ID Installer:') || !pkgSignature.includes(`(${teamId})`))
      throw new Error('PKG is not signed by the expected Developer ID Installer team')
    console.log('Submitting the signed PKG to Apple (waiting up to 45 minutes)')
    const result = run(
      'Submit PKG for notarization',
      '/usr/bin/xcrun',
      [
        'notarytool',
        'submit',
        pkgPath,
        '--keychain-profile',
        profile,
        '--keychain',
        keychain,
        '--wait',
        '--timeout',
        '45m',
        '--output-format',
        'json'
      ],
      childEnv,
      47 * 60_000
    )
    const notarizationId = assertAccepted(result)
    console.log(`Apple accepted notarization ${notarizationId}; stapling and verifying the ticket`)
    run('Staple PKG ticket', '/usr/bin/xcrun', ['stapler', 'staple', pkgPath], childEnv, 5 * 60_000)
    run('Validate PKG ticket', '/usr/bin/xcrun', ['stapler', 'validate', pkgPath], childEnv)
    run(
      'Assess PKG with Gatekeeper',
      '/usr/sbin/spctl',
      ['--assess', '--type', 'install', '--verbose=2', pkgPath],
      childEnv
    )
    run('Verify final PKG signature', '/usr/sbin/pkgutil', ['--check-signature', pkgPath], childEnv)
    writeFileSync(
      receiptFile,
      JSON.stringify({
        status: 'apple-notarized',
        teamId,
        notarizationId,
        version,
        sha: env.GITHUB_SHA,
        filename,
        checksum: createHash('sha256').update(readFileSync(pkgPath)).digest('hex')
      })
    )
  } finally {
    cleanupSigning(directory, env, run)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') throw new Error('Apple signing commands require macOS')
  try {
    if (process.argv[2] === 'cleanup') cleanupSigning(process.env.MACOS_SIGNING_DIR, process.env)
    else if (process.argv[2] === 'release') signMacRelease(process.env)
    else throw new Error('Expected release or cleanup')
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'macOS signing failed')
    process.exitCode = 1
  }
}
