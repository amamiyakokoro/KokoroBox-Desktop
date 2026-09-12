import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  proxyBridgeRepository,
  proxyBridgeSourceRevision
} from '../src/main/app-routing/integrity-manifest.ts'
import { macOSBundleVersion } from './macos-bundle-version.ts'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const targetArch = process.env.npm_config_target_arch || process.arch
const stagingRoot = path.join(repositoryRoot, 'extra', 'macos-app-routing-system-extension')
const moduleStagingRoot = path.join(repositoryRoot, 'extra', 'files', 'macos-app-routing')
const extensionBundleIdentifier = 'com.amamiyakokoro.app.proxy-extension'
// sysextd requires the service-path basename to exactly match CFBundleIdentifier.
const extensionBundleName = `${extensionBundleIdentifier}.systemextension`

if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(targetArch)) {
  rmSync(stagingRoot, { recursive: true, force: true })
  rmSync(moduleStagingRoot, { recursive: true, force: true })
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
const nativeModuleRoot = path.join(repositoryRoot, 'native', 'macos-app-routing')
const electronVersion = JSON.parse(
  readFileSync(path.join(repositoryRoot, 'node_modules', 'electron', 'package.json'), 'utf8')
).version as string
const packageVersion = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
  .version as string
const { marketingVersion, bundleVersion } = macOSBundleVersion(packageVersion)

rmSync(buildRoot, { recursive: true, force: true })
mkdirSync(buildRoot, { recursive: true })

if (!process.env.PROXYBRIDGE_SOURCE_DIR) {
  const clone = spawnSync(
    'git',
    ['clone', '--filter=blob:none', '--no-checkout', proxyBridgeRepository, sourceRoot],
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
const providerSource = readFileSync(
  path.join(sourceRoot, 'MacOS', 'ProxyBridge', 'extension', 'AppProxyProvider.swift'),
  'utf8'
)
if (
  !providerSource.includes('case "replaceKokoroBoxConfiguration":') ||
  !providerSource.includes('try installKokoroBoxConfiguration(data)') ||
  !providerSource.includes('case processName = "PROCESS_NAME"') ||
  !providerSource.includes('configuration.proxyUdpDns') ||
  !providerSource.includes('readAndForwardDnsUDP(association)')
) {
  throw new Error('Pinned ProxyBridge revision lacks required KokoroBox routing support')
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

const extensionInfo = path.join(extensionOutput, 'Contents', 'Info.plist')
const requiredExtensionMetadata: Record<string, string> = {
  CFBundleIdentifier: extensionBundleIdentifier,
  CFBundleExecutable: 'KokoroBoxProxyExtension',
  CFBundlePackageType: 'SYSX',
  CFBundleShortVersionString: marketingVersion,
  CFBundleVersion: bundleVersion
}
for (const [key, expected] of Object.entries(requiredExtensionMetadata)) {
  let actual: string
  try {
    actual = execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', extensionInfo], {
      encoding: 'utf8'
    }).trim()
  } catch {
    throw new Error(`KokoroBox ProxyBridge extension is missing ${key}`)
  }
  if (actual !== expected) {
    throw new Error(`KokoroBox ProxyBridge extension has invalid ${key}: ${actual}`)
  }
}

rmSync(stagingRoot, { recursive: true, force: true })
rmSync(moduleStagingRoot, { recursive: true, force: true })
mkdirSync(stagingRoot, { recursive: true })
mkdirSync(moduleStagingRoot, { recursive: true })
cpSync(extensionOutput, path.join(stagingRoot, extensionBundleName), {
  recursive: true
})
rmSync(
  path.join(stagingRoot, extensionBundleName, 'Contents', 'Resources', 'Info.KokoroBox.plist'),
  { force: true }
)

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
const moduleOutput = path.join(nativeModuleRoot, 'build', 'Release', 'kokorobox_app_routing.node')
if (moduleBuild.status !== 0 || !existsSync(moduleOutput)) {
  throw new Error('KokoroBox macOS application-routing N-API module build failed')
}
cpSync(moduleOutput, path.join(moduleStagingRoot, 'kokorobox-app-routing.node'))

cpSync(path.join(sourceRoot, 'LICENSE'), path.join(moduleStagingRoot, 'LICENSE.ProxyBridge'))
writeFileSync(
  path.join(moduleStagingRoot, 'manifest.json'),
  `${JSON.stringify({ version: 1, proxyBridgeRevision: proxyBridgeSourceRevision, arch: targetArch }, null, 2)}\n`
)
