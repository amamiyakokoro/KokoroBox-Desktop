import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { proxyBridgeSourceRevision } from '../src/main/app-routing/integrity-manifest.ts'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const targetArch = process.env.npm_config_target_arch || process.arch
const stagingRoot = path.join(repositoryRoot, 'extra', 'macos-app-routing-system-extension')
const helperRoot = path.join(repositoryRoot, 'extra', 'files', 'macos-app-routing')

if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(targetArch)) {
  rmSync(stagingRoot, { recursive: true, force: true })
  rmSync(helperRoot, { recursive: true, force: true })
  process.exit(0)
}

const buildRoot = path.join(
  process.env.RUNNER_TEMP || os.tmpdir(),
  `kokorobox-macos-routing-${targetArch}`
)
const sourceRoot = process.env.PROXYBRIDGE_SOURCE_DIR
  ? path.resolve(process.env.PROXYBRIDGE_SOURCE_DIR)
  : path.join(buildRoot, 'ProxyBridge')
const derivedData = path.join(buildRoot, 'DerivedData')
const extensionOutput = path.join(
  derivedData,
  'Build',
  'Products',
  'Debug',
  'KokoroBoxProxyExtension.systemextension'
)
const swiftArch = targetArch === 'x64' ? 'x86_64' : 'arm64'
const packageVersion = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
  .version as string
const versionParts = packageVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/)
if (!versionParts) throw new Error(`Unsupported macOS bundle version: ${packageVersion}`)
const marketingVersion = `${versionParts[1]}.${versionParts[2]}.${versionParts[3]}`
const bundleVersion = `${versionParts[1]}.${versionParts[2]}.${Number(versionParts[3]) * 1000 + Number(versionParts[4] ?? 0)}`

rmSync(buildRoot, { recursive: true, force: true })
mkdirSync(buildRoot, { recursive: true })

if (!process.env.PROXYBRIDGE_SOURCE_DIR) {
  const clone = spawnSync(
    'git',
    [
      'clone',
      '--filter=blob:none',
      '--no-checkout',
      'https://github.com/amamiyakokoro/ProxyBridge.git',
      sourceRoot
    ],
    { stdio: 'inherit' }
  )
  if (clone.status !== 0) throw new Error('ProxyBridge clone failed')
  const checkout = spawnSync(
    'git',
    ['-C', sourceRoot, 'checkout', '--detach', proxyBridgeSourceRevision],
    {
      stdio: 'inherit'
    }
  )
  if (checkout.status !== 0) throw new Error('ProxyBridge checkout failed')
}

const actualRevision = spawnSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {
  encoding: 'utf8'
}).stdout.trim()
if (actualRevision !== proxyBridgeSourceRevision) {
  throw new Error(`Unexpected ProxyBridge revision: ${actualRevision}`)
}

const xcodeProjectRoot = path.join(sourceRoot, 'MacOS', 'ProxyBridge')
const xcodeArgs = [
  '-project',
  path.join(xcodeProjectRoot, 'ProxyBridge.xcodeproj'),
  '-scheme',
  'extension',
  '-configuration',
  'Debug',
  '-derivedDataPath',
  derivedData,
  '-xcconfig',
  path.join(xcodeProjectRoot, 'kokorobox-ext.xcconfig'),
  `KOKOROBOX_TARGET_ARCH=${swiftArch}`,
  `MARKETING_VERSION=${marketingVersion}`,
  `CURRENT_PROJECT_VERSION=${bundleVersion}`,
  'SWIFT_OPTIMIZATION_LEVEL=-O',
  'CODE_SIGNING_ALLOWED=NO',
  'build'
]
const extensionBuild = spawnSync('xcodebuild', xcodeArgs, { cwd: sourceRoot, stdio: 'inherit' })
if (extensionBuild.status !== 0 || !existsSync(extensionOutput)) {
  throw new Error('KokoroBox ProxyBridge system extension build failed')
}

rmSync(stagingRoot, { recursive: true, force: true })
rmSync(helperRoot, { recursive: true, force: true })
mkdirSync(stagingRoot, { recursive: true })
mkdirSync(helperRoot, { recursive: true })
cpSync(extensionOutput, path.join(stagingRoot, 'KokoroBoxProxyExtension.systemextension'), {
  recursive: true
})
rmSync(
  path.join(
    stagingRoot,
    'KokoroBoxProxyExtension.systemextension',
    'Contents',
    'Resources',
    'Info.KokoroBox.plist'
  ),
  { force: true }
)

const helperOutput = path.join(helperRoot, 'kokorobox-app-routing-bridge')
const helperBuild = spawnSync(
  'xcrun',
  [
    'swiftc',
    '-O',
    '-target',
    `${swiftArch}-apple-macos13.0`,
    path.join(repositoryRoot, 'native', 'macos-app-routing', 'KokoroBoxAppRoutingBridge.swift'),
    '-framework',
    'AppKit',
    '-framework',
    'NetworkExtension',
    '-framework',
    'Security',
    '-framework',
    'SystemExtensions',
    '-o',
    helperOutput
  ],
  { stdio: 'inherit' }
)
if (helperBuild.status !== 0 || !existsSync(helperOutput)) {
  throw new Error('KokoroBox macOS application-routing bridge build failed')
}

cpSync(path.join(sourceRoot, 'LICENSE'), path.join(helperRoot, 'LICENSE.ProxyBridge'))
writeFileSync(
  path.join(helperRoot, 'manifest.json'),
  `${JSON.stringify({ version: 1, proxyBridgeRevision: proxyBridgeSourceRevision, arch: targetArch }, null, 2)}\n`
)
