import { is } from '@electron-toolkit/utils'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Keep the native updater dormant until appcast publication and privileged-component
// migration have both passed the upgrade matrix documented in docs/macos-updates.md.
export const macOSNativeUpdaterEnabled = false

interface MacOSUpdaterState {
  available: boolean
  initialized: boolean
  canCheckForUpdates: boolean
}

interface MacOSUpdaterBridge {
  state(): MacOSUpdaterState
  initialize(): MacOSUpdaterState
  checkForUpdates(): MacOSUpdaterState
}

let nativeBridge: MacOSUpdaterBridge | undefined

function updaterModulePath(): string {
  return is.dev
    ? path.join(process.cwd(), 'extra', 'macos-updater', 'kokorobox-updater.node')
    : path.join(process.resourcesPath, '..', 'Frameworks', 'kokorobox-updater.node')
}

function validateState(value: MacOSUpdaterState): MacOSUpdaterState {
  if (
    typeof value?.available !== 'boolean' ||
    typeof value.initialized !== 'boolean' ||
    typeof value.canCheckForUpdates !== 'boolean'
  ) {
    throw new Error('The macOS updater module returned an unsupported state')
  }
  return value
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

/** Opens Sparkle's standard update UI when the signed build has enabled it. */
export function showNativeMacOSUpdate(): boolean {
  if (process.platform !== 'darwin' || !macOSNativeUpdaterEnabled) return false

  const bridge = loadNativeBridge()
  let state = validateState(bridge.state())
  if (!state.available) throw new Error('The native macOS updater is unavailable')
  if (!state.initialized) state = validateState(bridge.initialize())
  validateState(bridge.checkForUpdates())
  return true
}
