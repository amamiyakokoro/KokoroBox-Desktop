export interface MacOSUpdaterState {
  available: boolean
  initialized: boolean
  canCheckForUpdates: boolean
}

export interface MacOSUpdaterBridge {
  state(): MacOSUpdaterState
  initialize(channel: MacOSUpdateChannel): MacOSUpdaterState
  checkForUpdates(channel: MacOSUpdateChannel): MacOSUpdaterState
}

export type MacOSUpdateChannel = 'stable' | 'rolling'

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

export function runNativeMacOSUpdater(
  bridge: MacOSUpdaterBridge,
  channel: MacOSUpdateChannel
): void {
  let state = validateState(bridge.state())
  if (!state.available) throw new Error('The native macOS updater is unavailable')
  if (!state.initialized) state = validateState(bridge.initialize(channel))
  if (!state.initialized || !state.canCheckForUpdates) {
    throw new Error('The native macOS updater is not ready to check for updates')
  }
  validateState(bridge.checkForUpdates(channel))
}
