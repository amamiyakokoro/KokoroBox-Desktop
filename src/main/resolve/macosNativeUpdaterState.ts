export interface MacOSUpdaterState {
  available: boolean
  initialized: boolean
  canCheckForUpdates: boolean
}

export interface MacOSUpdaterBridge {
  state(): MacOSUpdaterState
  initialize(channel: MacOSUpdateChannel): MacOSUpdaterState
  configure(channel: MacOSUpdateChannel, automaticallyChecksForUpdates: boolean): MacOSUpdaterState
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
  if (!state.initialized) {
    throw new Error('The native macOS updater is not ready to check for updates')
  }
  // Sparkle disables manual checks while one is already in progress.
  if (!state.canCheckForUpdates) return
  validateState(bridge.checkForUpdates(channel))
}

export function configureNativeMacOSUpdater(
  bridge: MacOSUpdaterBridge,
  channel: MacOSUpdateChannel,
  automaticallyChecksForUpdates: boolean
): void {
  let state = validateState(bridge.state())
  if (!state.available) throw new Error('The native macOS updater is unavailable')
  if (!state.initialized) state = validateState(bridge.initialize(channel))
  if (!state.initialized) throw new Error('The native macOS updater did not initialize')
  validateState(bridge.configure(channel, automaticallyChecksForUpdates))
}
