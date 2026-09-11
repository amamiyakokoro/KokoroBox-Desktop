import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const stagingRoot = path.join(repositoryRoot, 'extra', 'files', 'macos-service')
const nativeModuleRoot = path.join(repositoryRoot, 'native', 'macos-service')
const targetArch = process.env.npm_config_target_arch || process.arch

if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(targetArch)) {
  rmSync(stagingRoot, { recursive: true, force: true })
  process.exit(0)
}

const buildRoot = path.join(
  process.env.RUNNER_TEMP || os.tmpdir(),
  `kokorobox-macos-service-${targetArch}`
)
const electronVersion = JSON.parse(
  readFileSync(path.join(repositoryRoot, 'node_modules', 'electron', 'package.json'), 'utf8')
).version as string
const nodeGyp = path.join(repositoryRoot, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')

mkdirSync(buildRoot, { recursive: true })
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
const moduleOutput = path.join(
  nativeModuleRoot,
  'build',
  'Release',
  'kokorobox_service_management.node'
)
if (moduleBuild.status !== 0 || !existsSync(moduleOutput)) {
  throw new Error('KokoroBox macOS service-management N-API module build failed')
}

rmSync(stagingRoot, { recursive: true, force: true })
mkdirSync(stagingRoot, { recursive: true })
cpSync(moduleOutput, path.join(stagingRoot, 'kokorobox-service-management.node'))
writeFileSync(
  path.join(stagingRoot, 'manifest.json'),
  `${JSON.stringify({ schemaVersion: 1, arch: targetArch, minimumSystemVersion: '13.0' }, null, 2)}\n`
)
