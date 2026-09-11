import { is } from '@electron-toolkit/utils'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { MacOSUpdaterBridge, runNativeMacOSUpdater } from './macosNativeUpdaterState'

// Older builds reach this transition release through the notarized PKG updater. Once this
// code is installed, the stable privileged runtime and signed appcast can update the App bundle.
export const macOSNativeUpdaterEnabled = true

let nativeBridge: MacOSUpdaterBridge | undefined

function updaterModulePath(): string {
  return is.dev
    ? path.join(process.cwd(), 'extra', 'macos-updater', 'kokorobox-updater.node')
    : path.join(process.resourcesPath, '..', 'Frameworks', 'kokorobox-updater.node')
}

function loadNativeBridge(): MacOSUpdaterBridge {
  if (nativeBridge) return nativeBridge
  const modulePath = updaterModulePath()
  if (!existsSync(modulePath)) throw new Error('The macOS updater module is not installed')

  const nativeModule = { exports: {} } as NodeModule
  process.dlopen(nativeModule, modulePath)
  const candidate = nativeModule.exports as Partial<MacOSUpdaterBridge>
  if (
    typeof candidate.state !== 'function' ||
    typeof candidate.initialize !== 'function' ||
    typeof candidate.checkForUpdates !== 'function'
  ) {
    throw new Error('The macOS updater module has an unsupported interface')
  }
  nativeBridge = candidate as MacOSUpdaterBridge
  return nativeBridge
}

/** Opens Sparkle's standard update UI in packaged macOS builds. */
export function showNativeMacOSUpdate(
  platform: NodeJS.Platform = process.platform,
  bridgeOverride?: MacOSUpdaterBridge
): boolean {
  if (platform !== 'darwin' || !macOSNativeUpdaterEnabled) return false

  const bridge = bridgeOverride ?? loadNativeBridge()
  runNativeMacOSUpdater(bridge)
  return true
}
