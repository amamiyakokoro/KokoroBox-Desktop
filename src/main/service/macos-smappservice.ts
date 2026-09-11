import { existsSync } from 'node:fs'
import path from 'node:path'
import { resourcesFilesDir } from '../utils/dirs'

export type MacOSServiceRegistrationStatus =
  'not-registered' | 'enabled' | 'requires-approval' | 'not-found' | 'unknown'

interface MacOSServiceManagementBridge {
  status(): MacOSServiceRegistrationStatus
  register(): MacOSServiceRegistrationStatus
  unregister(): MacOSServiceRegistrationStatus
  reload(): MacOSServiceRegistrationStatus
  openSystemSettings(): void
}

let nativeBridge: MacOSServiceManagementBridge | undefined

function modulePath(): string {
  return path.join(resourcesFilesDir(), 'macos-service', 'kokorobox-service-management.node')
}

function isRegistrationStatus(value: unknown): value is MacOSServiceRegistrationStatus {
  return (
    typeof value === 'string' &&
    ['not-registered', 'enabled', 'requires-approval', 'not-found', 'unknown'].includes(value)
  )
}

function loadNativeBridge(): MacOSServiceManagementBridge {
  if (nativeBridge) return nativeBridge
  const target = modulePath()
  if (!existsSync(target)) throw new Error('The macOS service-management module is not installed')

  const nativeModule = { exports: {} } as NodeModule
  process.dlopen(nativeModule, target)
  const candidate = nativeModule.exports as Partial<MacOSServiceManagementBridge>
  if (
    typeof candidate.status !== 'function' ||
    typeof candidate.register !== 'function' ||
    typeof candidate.unregister !== 'function' ||
    typeof candidate.reload !== 'function' ||
    typeof candidate.openSystemSettings !== 'function'
  ) {
    throw new Error('The macOS service-management module has an unsupported interface')
  }
  nativeBridge = candidate as MacOSServiceManagementBridge
  return nativeBridge
}

function checkedStatus(value: unknown): MacOSServiceRegistrationStatus {
  if (!isRegistrationStatus(value)) {
    throw new Error('The macOS service-management module returned an invalid status')
  }
  return value
}

export function macOSServiceRegistrationStatus(): MacOSServiceRegistrationStatus {
  return checkedStatus(loadNativeBridge().status())
}

export function registerMacOSService(): MacOSServiceRegistrationStatus {
  const bridge = loadNativeBridge()
  const current = checkedStatus(bridge.status())
  if (current === 'enabled' || current === 'requires-approval') return current

  try {
    return checkedStatus(bridge.register())
  } catch (error) {
    // The initial registration may return an authorization error while macOS
    // records the daemon as awaiting approval. Preserve that actionable state.
    if (checkedStatus(bridge.status()) === 'requires-approval') return 'requires-approval'
    throw error
  }
}

export function unregisterMacOSService(): MacOSServiceRegistrationStatus {
  const bridge = loadNativeBridge()
  const current = checkedStatus(bridge.status())
  if (current === 'not-registered' || current === 'not-found') return current
  return checkedStatus(bridge.unregister())
}

export function reloadMacOSService(): MacOSServiceRegistrationStatus {
  return checkedStatus(loadNativeBridge().reload())
}

export function openMacOSServiceSystemSettings(): void {
  loadNativeBridge().openSystemSettings()
}
