import { is } from '@electron-toolkit/utils'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  configureNativeMacOSUpdater as configureNativeMacOSUpdaterState,
  MacOSUpdateChannel,
  MacOSUpdaterBridge,
  runNativeMacOSUpdater
} from './macosNativeUpdaterState'
import { setNotQuitDialog } from './appLifecycle'

// Older builds reach this transition release through the notarized PKG updater. Once this
// code is installed, the stable privileged runtime and signed appcast can update the App bundle.
export const macOSNativeUpdaterEnabled = true

interface MacOSUpdaterRuntimeBridge extends MacOSUpdaterBridge {
  setRelaunchHandler(handler: () => void): void
}

let nativeBridge: MacOSUpdaterRuntimeBridge | undefined
const bridgesWithRelaunchHandler = new WeakSet<MacOSUpdaterRuntimeBridge>()

function updaterModulePath(): string {
  return is.dev
    ? path.join(process.cwd(), 'extra', 'macos-updater', 'kokorobox-updater.node')
    : path.join(process.resourcesPath, '..', 'Frameworks', 'kokorobox-updater.node')
}

function loadNativeBridge(): MacOSUpdaterRuntimeBridge {
  if (nativeBridge) return nativeBridge
  const modulePath = updaterModulePath()
  if (!existsSync(modulePath)) throw new Error('The macOS updater module is not installed')

  const nativeModule = { exports: {} } as NodeModule
  process.dlopen(nativeModule, modulePath)
  const candidate = nativeModule.exports as Partial<MacOSUpdaterRuntimeBridge>
  if (
    typeof candidate.state !== 'function' ||
    typeof candidate.initialize !== 'function' ||
    typeof candidate.configure !== 'function' ||
    typeof candidate.checkForUpdates !== 'function' ||
    typeof candidate.setRelaunchHandler !== 'function'
  ) {
    throw new Error('The macOS updater module has an unsupported interface')
  }
  nativeBridge = candidate as MacOSUpdaterRuntimeBridge
  return nativeBridge
}

function registerRelaunchHandler(bridge: MacOSUpdaterRuntimeBridge): void {
  if (bridgesWithRelaunchHandler.has(bridge)) return
  bridge.setRelaunchHandler(setNotQuitDialog)
  bridgesWithRelaunchHandler.add(bridge)
}

/** Opens Sparkle's standard update UI in packaged macOS builds. */
export function showNativeMacOSUpdate(
  channel: MacOSUpdateChannel,
  platform: NodeJS.Platform = process.platform,
  bridgeOverride?: MacOSUpdaterRuntimeBridge
): boolean {
  if (platform !== 'darwin' || !macOSNativeUpdaterEnabled) return false

  const bridge = bridgeOverride ?? loadNativeBridge()
  registerRelaunchHandler(bridge)
  runNativeMacOSUpdater(bridge, channel)
  return true
}

/** Starts Sparkle's own background schedule using the app's update preferences. */
export function configureNativeMacOSUpdate(
  channel: MacOSUpdateChannel,
  automaticallyChecksForUpdates: boolean,
  platform: NodeJS.Platform = process.platform,
  bridgeOverride?: MacOSUpdaterRuntimeBridge
): void {
  if (platform !== 'darwin' || !macOSNativeUpdaterEnabled) return

  const bridge = bridgeOverride ?? loadNativeBridge()
  registerRelaunchHandler(bridge)
  configureNativeMacOSUpdaterState(bridge, channel, automaticallyChecksForUpdates)
}
