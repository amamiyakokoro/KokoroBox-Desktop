import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const outputDir = path.join(repositoryRoot, 'extra', 'files', 'process-router')
const targetArch = process.env.npm_config_target_arch || process.arch

if (process.platform !== 'win32' || targetArch !== 'x64') {
  // Never let a stale x64 payload leak into an unsupported package.
  rmSync(outputDir, { recursive: true, force: true })
  process.exit(0)
}

const result = spawnSync(
  'pwsh.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(repositoryRoot, 'scripts', 'build-proxybridge.ps1')
  ],
  {
    cwd: repositoryRoot,
    stdio: 'inherit'
  }
)

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
