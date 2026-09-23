import { tr } from '../../shared/i18n'
import {
  macOSServicePlistPath,
  macOSServiceRuntimePath,
  serviceIdentityFallbackPath,
  servicePath
} from '../utils/dirs'
import { KeyManager, openNativeServiceIdentity, validateKeyPair } from './key'
import {
  bootstrapMacOSServiceAuth,
  initServiceAPI,
  getServiceAxios,
  getServiceMeta,
  invalidateServiceMeta,
  ping,
  test,
  ServiceAPIError,
  isServiceConnectionError
} from './api'
import { getAppConfig, patchAppConfig } from '../config/app'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  deleteServiceAuthSecret,
  loadServiceAuthSecret,
  type ServiceAuthSecret
} from './auth-store'
import {
  getCurrentUserSid,
  cleanupLegacyMacosService,
  getMacosManagedServiceStatus,
  openMacosLoginItemsSettings,
  registerMacosManagedService,
  reloadMacosManagedService,
  runServiceLifecycleElevated,
  stopMacosManagedService,
  unregisterMacosManagedService,
  type MacOSManagedServiceStatus
} from 'kokorobox-native'
import * as native from 'kokorobox-native'
import { systemCoreOnlyBuild } from '../../shared/build-flags'
import { parseServiceLog } from './log-parser'
import { existsSync } from 'fs'
import { appendAppLog } from '../utils/log'
let keyManager: KeyManager | null = null
let macOSServiceRecoveryPromise: Promise<void> | undefined
let pendingLegacyServiceAuthCleanup = false
const execFilePromise = promisify(execFile)
const MACOS_SERVICE_PLIST_NAME = 'KokoroBoxService.plist'

function macOSServiceRegistrationStatus(): MacOSManagedServiceStatus {
  return getMacosManagedServiceStatus(MACOS_SERVICE_PLIST_NAME)
}

function registerMacOSService(): MacOSManagedServiceStatus {
  return registerMacosManagedService(MACOS_SERVICE_PLIST_NAME)
}

function unregisterMacOSService(): MacOSManagedServiceStatus {
  return unregisterMacosManagedService(MACOS_SERVICE_PLIST_NAME)
}

function reloadMacOSService(): MacOSManagedServiceStatus {
  return reloadMacosManagedService(MACOS_SERVICE_PLIST_NAME)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function parseLegacyServiceAuth(value: string): ServiceAuthSecret | null {
  try {
    const [publicKey, privateKey] = value.split(':')
    if (!publicKey || !privateKey) {
      return null
    }

    return validateKeyPair(publicKey, privateKey)
  } catch {
    return null
  }
}

async function clearLegacyServiceAuth(): Promise<void> {
  await patchAppConfig({
    serviceAuthKey: undefined
  })
}

async function loadServiceAuthFromLegacyConfig(): Promise<ServiceAuthSecret | null> {
  const config = await getAppConfig()
  if (!config.serviceAuthKey) {
    return null
  }

  const legacySecret = parseLegacyServiceAuth(config.serviceAuthKey)
  if (!legacySecret) {
    return null
  }

  return legacySecret
}

async function loadAvailableServiceAuth(): Promise<ServiceAuthSecret | null> {
  try {
    const storedSecret = await loadServiceAuthSecret()
    if (storedSecret) {
      const config = await getAppConfig()
      if (config.serviceAuthKey) {
        await clearLegacyServiceAuth()
      }
      return storedSecret
    }
  } catch {
    // ignore invalid auth storage and try the legacy config field
  }

  return await loadServiceAuthFromLegacyConfig()
}

async function ensurePersistedServiceAuth(target: KeyManager): Promise<{
  keyId: string
  publicKey: string
}> {
  if (target.isInitialized()) {
    return { keyId: target.getKeyID(), publicKey: target.getPublicKey() }
  }

  const legacy = await loadAvailableServiceAuth()
  const identity = await openNativeServiceIdentity(
    serviceIdentityFallbackPath(),
    legacy ?? undefined
  )
  target.setIdentity(identity)
  await appendAppLog(`[Service]: service identity backend: ${target.getBackend()}\n`)
  // Keep the migration source until the service has accepted an authenticated
  // request signed by this identity. Otherwise an interrupted upgrade can
  // strand the service on its old public key with no way to recover it.
  pendingLegacyServiceAuthCleanup = legacy !== null
  return { keyId: target.getKeyID(), publicKey: target.getPublicKey() }
}

async function finalizeServiceAuthMigration(): Promise<void> {
  if (!pendingLegacyServiceAuthCleanup) return
  try {
    await clearLegacyServiceAuth()
    await deleteServiceAuthSecret()
    pendingLegacyServiceAuthCleanup = false
    await appendAppLog('[Service]: legacy service identity migration finalized\n')
  } catch (error) {
    await appendAppLog(`[Service]: legacy service identity cleanup deferred, ${error}\n`)
  }
}

export async function initKeyManager(): Promise<KeyManager> {
  if (keyManager) {
    return keyManager
  }

  const nextKeyManager = new KeyManager()
  await ensurePersistedServiceAuth(nextKeyManager)
  keyManager = nextKeyManager
  initServiceAPI(nextKeyManager)
  return nextKeyManager
}

export function getKeyManager(): KeyManager {
  if (!keyManager) {
    throw new Error(tr('Key manager is not initialized. Call initKeyManager first'))
  }
  return keyManager
}

export function getPublicKey(): string {
  return getKeyManager().getPublicKey()
}

class UserCancelledError extends Error {
  constructor(message = tr('Operation cancelled by user')) {
    super(message)
    this.name = 'UserCancelledError'
  }
}

function isUserCancelledError(error: unknown): boolean {
  if (error instanceof UserCancelledError) {
    return true
  }
  const errorMsg = error instanceof Error ? error.message : String(error)
  return (
    /(?:用户|用戶|使用者)已取消/.test(errorMsg) ||
    errorMsg.includes('User canceled') ||
    errorMsg.includes('(-128)') ||
    errorMsg.includes('user cancelled') ||
    errorMsg.includes('dismissed')
  )
}

function serviceCommandOutput(value: unknown): string {
  if (typeof value === 'object' && value) {
    const output = value as { stdout?: unknown; stderr?: unknown }
    if (output.stdout != null || output.stderr != null) {
      return [String(output.stdout ?? ''), String(output.stderr ?? '')].join('\n')
    }
  }
  return value instanceof Error ? value.message : String(value)
}

function serviceCommandErrorMessage(error: unknown): string {
  const entry = parseServiceLog(serviceCommandOutput(error))
  const message = entry?.msg ?? entry?.message
  const detail = entry?.status?.error ?? entry?.error
  if (message && detail && message !== detail) {
    return `${message}：${detail}`
  }
  return detail || message || (error instanceof Error ? error.message : String(error))
}

function isServiceAuthenticationStateError(error: unknown): boolean {
  if (
    error instanceof ServiceAPIError &&
    error.status !== undefined &&
    [401, 403, 409, 503].includes(error.status)
  ) {
    return true
  }
  const message = serviceCommandErrorMessage(error).toLowerCase()
  return (
    message.includes('key id is not registered') ||
    message.includes('service is not initialized') ||
    message.includes('authentication is already initialized')
  )
}

function getAuthorizedPrincipal(): { authorizedSid?: string; authorizedUid?: number } {
  if (process.platform === 'win32') {
    const sid = getCurrentUserSid()
    if (!sid.startsWith('S-')) {
      throw new Error(tr('Failed to read the current user SID'))
    }

    return { authorizedSid: sid }
  }

  const uid = process.getuid?.()
  if (uid == null) {
    throw new Error(tr('Failed to read the current user UID'))
  }

  return { authorizedUid: uid }
}

export function exportPublicKey(): string {
  return getPublicKey()
}

export function getAxios() {
  return getServiceAxios()
}

async function waitForServiceReady(timeoutMs = 15000): Promise<void> {
  invalidateServiceMeta()
  const startedAt = Date.now()
  let lastError: unknown = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await ping()
      await test()
      await getServiceMeta()
      return
    } catch (error) {
      lastError = error
    }

    await delay(500)
  }

  throw new Error(
    tr('Timed out waiting for service readiness: {0}', [
      lastError instanceof Error ? lastError.message : String(lastError)
    ])
  )
}

async function removeLegacyMacOSService(): Promise<void> {
  if (existsSync(macOSServicePlistPath()) || existsSync(macOSServiceRuntimePath())) {
    await cleanupLegacyMacosService()
  }
}

async function performMacOSServiceInstall(): Promise<void> {
  const previousStatus = macOSServiceRegistrationStatus()
  const status = previousStatus === 'enabled' ? reloadMacOSService() : registerMacOSService()
  await appendAppLog(
    `[Service]: macOS SMAppService ${previousStatus === 'enabled' ? 'reload' : 'register'}, ${previousStatus} -> ${status}\n`
  )
  if (status === 'requires-approval') {
    openMacosLoginItemsSettings()
  }
}

async function installMacOSService(): Promise<void> {
  if (!macOSServiceRecoveryPromise) {
    macOSServiceRecoveryPromise = performMacOSServiceInstall().finally(() => {
      macOSServiceRecoveryPromise = undefined
    })
  }
  return macOSServiceRecoveryPromise
}

export async function initService(allowInteractiveRecovery = false): Promise<void> {
  const currentKeyManager = await initKeyManager()
  const secret = await ensurePersistedServiceAuth(currentKeyManager)
  const execPath = servicePath()

  try {
    if (process.platform === 'darwin') {
      const startedAt = Date.now()
      while (true) {
        try {
          await bootstrapMacOSServiceAuth(secret.publicKey)
          break
        } catch (error) {
          if (error instanceof ServiceAPIError && error.status === 409) {
            if (await testServiceConnection()) break
            if (!allowInteractiveRecovery) {
              throw new Error('The service is initialized for a different client key')
            }
            await runServiceLifecycleElevated({
              executablePath: execPath,
              action: 'init',
              publicKey: secret.publicKey,
              ...getAuthorizedPrincipal()
            })
            await waitForServiceReady()
            await finalizeServiceAuthMigration()
            return
          }
          if (!isServiceConnectionError(error) || Date.now() - startedAt >= 15000) {
            throw error
          }
          await delay(500)
        }
      }
      await waitForServiceReady()
      await finalizeServiceAuthMigration()
      return
    }

    await runServiceLifecycleElevated({
      executablePath: execPath,
      action: 'init',
      publicKey: secret.publicKey,
      ...getAuthorizedPrincipal()
    })
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('Service initialization failed: {0}', [serviceCommandErrorMessage(error)]))
  }

  await waitForServiceReady()
  await finalizeServiceAuthMigration()
}

export async function installService(): Promise<void> {
  const execPath = servicePath()

  try {
    if (process.platform === 'darwin') {
      await installMacOSService()
    } else {
      await runServiceLifecycleElevated({ executablePath: execPath, action: 'install' })
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('Service installation failed: {0}', [serviceCommandErrorMessage(error)]))
  }
}

export async function ensureMacOSServiceReady(): Promise<void> {
  if (process.platform !== 'darwin') return

  let status = await serviceStatus()
  if (status === 'not-installed' || status === 'unknown') {
    await installService()
    status = await serviceStatus()
  }

  if (status === 'requires-approval') {
    throw new Error(tr('Allow the KokoroBox background service in System Settings'))
  }

  if (status === 'stopped' || status === 'paused') {
    await startService()
    status = await serviceStatus()
  }

  if (status !== 'running' || !(await testServiceConnection())) {
    await initService()
  }
}

export async function uninstallService(): Promise<void> {
  const execPath = servicePath()

  try {
    if (process.platform === 'darwin') {
      unregisterMacOSService()
      await removeLegacyMacOSService()
    } else {
      await runServiceLifecycleElevated({ executablePath: execPath, action: 'uninstall' })
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('Service uninstall failed: {0}', [serviceCommandErrorMessage(error)]))
  }
}

export async function startService(): Promise<void> {
  const execPath = servicePath()

  try {
    if (process.platform === 'darwin') {
      await installMacOSService()
    } else {
      await runServiceLifecycleElevated({ executablePath: execPath, action: 'start' })
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('Failed to start service: {0}', [serviceCommandErrorMessage(error)]))
  }
}

export async function stopService(): Promise<void> {
  const execPath = servicePath()

  try {
    if (process.platform === 'darwin') {
      await stopMacosManagedService()
    } else {
      await runServiceLifecycleElevated({ executablePath: execPath, action: 'stop' })
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('Failed to stop service: {0}', [serviceCommandErrorMessage(error)]))
  }
}

export async function restartService(): Promise<void> {
  const execPath = servicePath()

  try {
    if (process.platform === 'darwin') {
      await installMacOSService()
    } else {
      await runServiceLifecycleElevated({ executablePath: execPath, action: 'restart' })
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('Failed to restart service: {0}', [serviceCommandErrorMessage(error)]))
  }
}

export async function serviceStatus(): Promise<
  'running' | 'stopped' | 'not-installed' | 'requires-approval' | 'paused' | 'unknown' | 'need-init'
> {
  let bundledMacOSRegistration = false
  if (process.platform === 'darwin' && !systemCoreOnlyBuild) {
    try {
      const registration = macOSServiceRegistrationStatus()
      if (registration === 'requires-approval') return 'requires-approval'
      if (registration !== 'enabled') return 'not-installed'
      bundledMacOSRegistration = true
    } catch {
      return 'unknown'
    }
  }

  const execPath = servicePath()
  let commandState: string | undefined

  // Native owns the platform-specific OS status probe. Keep the Service CLI
  // fallback for older native builds and Linux machines using another init.
  const nativeStatus = native as typeof native & {
    getWindowsServiceStatus?: () => 'running' | 'stopped' | 'paused' | 'not-installed' | 'unknown'
    getLinuxServiceStatus?: () => Promise<'running' | 'stopped' | 'not-installed' | 'unknown'>
    getMacosServiceProcessStatus?: () => Promise<'running' | 'stopped' | 'not-installed' | 'unknown'>
  }
  const queryNativeStatus =
    process.platform === 'win32'
      ? nativeStatus.getWindowsServiceStatus
      : process.platform === 'linux'
        ? nativeStatus.getLinuxServiceStatus
        : process.platform === 'darwin'
          ? nativeStatus.getMacosServiceProcessStatus
          : undefined
  if (typeof queryNativeStatus === 'function') {
    try {
      commandState = await queryNativeStatus()
    } catch {
      // The native OS probe is unavailable; retain the Service CLI fallback.
    }
  }

  if (commandState === undefined) {
    try {
      const { stdout, stderr } = await execFilePromise(execPath, ['service', 'status'], {
        windowsHide: true
      })
      commandState = parseServiceLog(`${stdout}\n${stderr}`)?.status?.state
    } catch (error) {
      commandState = parseServiceLog(serviceCommandOutput(error))?.status?.state
    }
  }

  if (commandState === 'not-installed') {
    return bundledMacOSRegistration ? 'stopped' : 'not-installed'
  }
  if (commandState === 'stopped') return 'stopped'
  if (commandState === 'paused') return 'paused'

  // A running service is still observable through its authenticated IPC even
  // when an older helper cannot read the Windows SCM status as a standard user.
  try {
    await ping()
    try {
      await test()
      await finalizeServiceAuthMigration()
      return 'running'
    } catch (error) {
      if (isServiceAuthenticationStateError(error)) return 'need-init'
      // A process-level status of running only proves that launchd/SCM has a
      // live service process. Never report it as usable after the authenticated
      // API probe failed.
      return 'unknown'
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    if (
      errorMsg.includes('EACCES') ||
      errorMsg.includes('permission denied') ||
      errorMsg.includes('access is denied')
    ) {
      return 'need-init'
    }
    return commandState === 'running' ? 'running' : 'unknown'
  }
}

export function openServiceSystemSettings(): void {
  if (process.platform !== 'darwin') return
  openMacosLoginItemsSettings()
}

export async function testServiceConnection(): Promise<boolean> {
  invalidateServiceMeta()
  try {
    await test()
    await getServiceMeta()
    await finalizeServiceAuthMigration()
    return true
  } catch {
    invalidateServiceMeta()
    return false
  }
}
