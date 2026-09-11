import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const sparkleRelease = Object.freeze({
  version: '2.9.6',
  archiveName: 'Sparkle-for-Swift-Package-Manager.zip',
  sha256: '8d5fb41d960b43f4a68aa14126bf62b098544ec8d191cdcc73eb14e63a8e7606',
  url: 'https://github.com/sparkle-project/Sparkle/releases/download/2.9.6/Sparkle-for-Swift-Package-Manager.zip'
})

const repositoryRoot = path.resolve(import.meta.dirname, '..')
export const sparkleStagingRoot = path.join(repositoryRoot, 'extra', 'macos-updater')

export function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export function assertSparkleArchive(file: string): void {
  const actual = sha256File(file)
  if (actual !== sparkleRelease.sha256) {
    throw new Error(
      `Sparkle archive integrity check failed (expected ${sparkleRelease.sha256}, got ${actual})`
    )
  }
}

async function downloadPinnedArchive(destination: string): Promise<void> {
  const response = await fetch(sparkleRelease.url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Sparkle download failed: HTTP ${response.status}`)

  const temporary = `${destination}.download`
  rmSync(temporary, { force: true })
  writeFileSync(temporary, Buffer.from(await response.arrayBuffer()), { mode: 0o600 })
  try {
    assertSparkleArchive(temporary)
    renameSync(temporary, destination)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export async function prepareMacOSSparkle(): Promise<void> {
  if (process.platform !== 'darwin') {
    rmSync(sparkleStagingRoot, { recursive: true, force: true })
    return
  }

  const buildRoot = path.join(
    process.env.RUNNER_TEMP || os.tmpdir(),
    `kokorobox-sparkle-${sparkleRelease.version}`
  )
  const archiveOverride = process.env.SPARKLE_ARCHIVE_PATH
  if (archiveOverride && !path.isAbsolute(archiveOverride)) {
    throw new Error('SPARKLE_ARCHIVE_PATH must be an absolute path')
  }
  const archive = archiveOverride || path.join(buildRoot, sparkleRelease.archiveName)
  const extracted = path.join(buildRoot, 'extracted')

  mkdirSync(buildRoot, { recursive: true })
  if (!existsSync(archive)) await downloadPinnedArchive(archive)
  assertSparkleArchive(archive)

  rmSync(extracted, { recursive: true, force: true })
  mkdirSync(extracted, { recursive: true })
  const extraction = spawnSync('/usr/bin/ditto', ['-x', '-k', archive, extracted], {
    stdio: 'inherit'
  })
  if (extraction.status !== 0) throw new Error('Sparkle archive extraction failed')

  const framework = path.join(
    extracted,
    'Sparkle.xcframework',
    'macos-arm64_x86_64',
    'Sparkle.framework'
  )
  const license = path.join(extracted, 'LICENSE')
  if (!existsSync(framework) || !existsSync(license)) {
    throw new Error('Pinned Sparkle archive has an unexpected layout')
  }

  rmSync(sparkleStagingRoot, { recursive: true, force: true })
  mkdirSync(sparkleStagingRoot, { recursive: true })
  cpSync(framework, path.join(sparkleStagingRoot, 'Sparkle.framework'), {
    recursive: true,
    preserveTimestamps: true,
    // Framework aliases must remain relative or the packaged App will point at the CI temp dir.
    verbatimSymlinks: true
  })
  copyFileSync(license, path.join(sparkleStagingRoot, 'LICENSE.Sparkle'))
  writeFileSync(
    path.join(sparkleStagingRoot, 'manifest.json'),
    `${JSON.stringify({ schemaVersion: 1, ...sparkleRelease }, null, 2)}\n`
  )

  const nativeModuleRoot = path.join(repositoryRoot, 'native', 'macos-updater')
  const electronVersion = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'node_modules', 'electron', 'package.json'), 'utf8')
  ).version as string
  const targetArch = process.env.npm_config_target_arch || process.arch
  if (!['arm64', 'x64'].includes(targetArch)) {
    throw new Error(`Unsupported macOS updater architecture: ${targetArch}`)
  }
  const nodeGyp = path.join(repositoryRoot, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
  const moduleBuild = spawnSync(
    process.execPath,
    [
      nodeGyp,
      'rebuild',
      `--target=${electronVersion}`,
      `--arch=${targetArch}`,
      '--dist-url=https://electronjs.org/headers',
      `--devdir=${path.join(buildRoot, 'node-gyp')}`
    ],
    { cwd: nativeModuleRoot, stdio: 'inherit' }
  )
  const moduleOutput = path.join(nativeModuleRoot, 'build', 'Release', 'kokorobox_updater.node')
  if (moduleBuild.status !== 0 || !existsSync(moduleOutput)) {
    throw new Error('KokoroBox macOS updater N-API module build failed')
  }
  copyFileSync(moduleOutput, path.join(sparkleStagingRoot, 'kokorobox-updater.node'))
}

const invokedScript = process.argv[1] && path.resolve(process.argv[1])
if (invokedScript === path.resolve(fileURLToPath(import.meta.url))) {
  await prepareMacOSSparkle()
}
