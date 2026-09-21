import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  macOSSystemExtensionBundleVersion,
  macOSSystemExtensionVersion,
  proxyBridgeRepository,
  proxyBridgeSourceRevision
} from '../src/main/app-routing/integrity-manifest.ts'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const targetArch = process.env.npm_config_target_arch || process.arch
const stagingRoot = path.join(repositoryRoot, 'extra', 'macos-app-routing-system-extension')
const metadataStagingRoot = path.join(repositoryRoot, 'extra', 'files', 'macos-app-routing')
const extensionBundleIdentifier = 'com.amamiyakokoro.app.proxy-extension'
// sysextd requires the service-path basename to exactly match CFBundleIdentifier.
const extensionBundleName = `${extensionBundleIdentifier}.systemextension`

if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(targetArch)) {
  rmSync(stagingRoot, { recursive: true, force: true })
  rmSync(metadataStagingRoot, { recursive: true, force: true })
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
if (
  !/^\d+\.\d+\.\d+$/.test(macOSSystemExtensionVersion) ||
  !/^[1-9]\d*$/.test(macOSSystemExtensionBundleVersion)
) {
  throw new Error('Invalid pinned macOS System Extension version')
}

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
  `MARKETING_VERSION=${macOSSystemExtensionVersion}`,
  `CURRENT_PROJECT_VERSION=${macOSSystemExtensionBundleVersion}`,
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
  CFBundleShortVersionString: macOSSystemExtensionVersion,
  CFBundleVersion: macOSSystemExtensionBundleVersion
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
rmSync(metadataStagingRoot, { recursive: true, force: true })
mkdirSync(stagingRoot, { recursive: true })
mkdirSync(metadataStagingRoot, { recursive: true })
cpSync(extensionOutput, path.join(stagingRoot, extensionBundleName), {
  recursive: true
})
rmSync(
  path.join(stagingRoot, extensionBundleName, 'Contents', 'Resources', 'Info.KokoroBox.plist'),
  { force: true }
)

cpSync(path.join(sourceRoot, 'LICENSE'), path.join(metadataStagingRoot, 'LICENSE.ProxyBridge'))
writeFileSync(
  path.join(metadataStagingRoot, 'manifest.json'),
  `${JSON.stringify({ version: 1, proxyBridgeRevision: proxyBridgeSourceRevision, arch: targetArch }, null, 2)}\n`
)
