const { execFileSync } = require('node:child_process')
const { copyFileSync, existsSync } = require('node:fs')
const path = require('node:path')

function sign(target, entitlements) {
  const identity = process.env.KOKOROBOX_CODESIGN_IDENTITY
  const keychain = process.env.KOKOROBOX_CODESIGN_KEYCHAIN
  if (!identity || !keychain) throw new Error('Missing isolated KokoroBox signing context')
  try {
    execFileSync(
      '/usr/bin/codesign',
      [
        '--force',
        '--sign',
        identity,
        '--keychain',
        keychain,
        '--timestamp',
        '--options',
        'runtime',
        '--entitlements',
        entitlements,
        target
      ],
      { stdio: 'pipe' }
    )
  } catch {
    throw new Error(`Failed to sign protected macOS routing component: ${path.basename(target)}`)
  }
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const projectDir = context.packager.projectDir
  const appPath = path.join(context.appOutDir, 'KokoroBox.app')
  const extensionPath = path.join(
    appPath,
    'Contents',
    'Library',
    'SystemExtensions',
    'KokoroBoxProxyExtension.systemextension'
  )
  const extensionProfile = process.env.KOKOROBOX_EXTENSION_PROVISIONING_PROFILE_PATH
  if (!existsSync(extensionPath) || !extensionProfile) {
    throw new Error('Incomplete macOS application-routing payload')
  }
  copyFileSync(extensionProfile, path.join(extensionPath, 'Contents', 'embedded.provisionprofile'))
  sign(extensionPath, path.join(projectDir, 'build', 'entitlements.mac.extension.plist'))
}
