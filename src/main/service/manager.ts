import { tr } from '../../shared/i18n'
import { macOSServicePlistPath, macOSServiceRuntimePath, servicePath } from '../utils/dirs'
import { execWithElevation } from '../utils/elevation'
import { KeyManager, type KeyPair, validateKeyPair } from './key'
import { initServiceAPI, getServiceAxios, ping, test, ServiceAPIError } from './api'
import { getAppConfig, patchAppConfig } from '../config/app'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { loadServiceAuthSecret, saveServiceAuthSecret, type ServiceAuthSecret } from './auth-store'
import { getCurrentUserSid } from 'kokorobox-native'
import { systemCoreOnlyBuild } from '../../shared/build-flags'
import { parseServiceLog } from './log-parser'
import { existsSync } from 'fs'
import {
  macOSServiceRegistrationStatus,
  openMacOSServiceSystemSettings,
  registerMacOSService,
  unregisterMacOSService
} from './macos-smappservice'

let keyManager: KeyManager | null = null
const execFilePromise = promisify(execFile)

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

  await saveServiceAuthSecret(legacySecret)
  await clearLegacyServiceAuth()
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

function applyServiceAuthSecret(target: KeyManager, secret: ServiceAuthSecret | null): void {
  target.clear()
  if (secret) {
    target.setKeyPair(secret.publicKey, secret.privateKey, secret.keyId)
  }
}

function currentServiceAuthSecret(target: KeyManager): ServiceAuthSecret {
  return {
    keyId: target.getKeyID(),
    publicKey: target.getPublicKey(),
    privateKey: target.getPrivateKey()
  }
}

async function ensurePersistedServiceAuth(target: KeyManager): Promise<ServiceAuthSecret> {
  if (target.isInitialized()) {
    return currentServiceAuthSecret(target)
  }

  const existingSecret = await loadAvailableServiceAuth()
  if (existingSecret) {
    applyServiceAuthSecret(target, existingSecret)
    return existingSecret
  }

  const generatedKeyPair: KeyPair = target.generateKeyPair()
  await saveServiceAuthSecret(generatedKeyPair)
  await clearLegacyServiceAuth()
  return generatedKeyPair
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
    throw new Error(tr('密钥管理器未初始化，请先调用 initKeyManager'))
  }
  return keyManager
}

export function getPublicKey(): string {
  return getKeyManager().getPublicKey()
}

class UserCancelledError extends Error {
  constructor(message = tr('用户取消操作')) {
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

async function getAuthorizedPrincipalArgs(): Promise<string[]> {
  if (process.platform === 'win32') {
    const sid = getCurrentUserSid()
    if (!sid.startsWith('S-')) {
      throw new Error(tr('读取当前用户 SID 失败'))
    }

    return ['--authorized-sid', sid]
  }

  const uid = process.getuid?.()
  if (uid == null) {
    throw new Error(tr('读取当前用户 UID 失败'))
  }

  return ['--authorized-uid', String(uid)]
}

export function exportPublicKey(): string {
  return getPublicKey()
}

export function getAxios() {
  return getServiceAxios()
}

async function waitForServiceReady(timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now()
  let lastError: unknown = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await ping()
      await test()
      return
    } catch (error) {
      lastError = error
    }

    await delay(500)
  }

  throw new Error(
    tr('等待服务就绪超时：{0}', [
      lastError instanceof Error ? lastError.message : String(lastError)
    ])
  )
}

async function removeLegacyMacOSService(): Promise<void> {
  if (existsSync(macOSServicePlistPath())) {
    try {
      await execWithElevation('/bin/launchctl', ['bootout', 'system/KokoroBoxService'])
    } catch {
      // The legacy service may already be stopped or unloaded.
    }
    await execWithElevation('/bin/rm', ['-f', macOSServicePlistPath()])
  }
  if (existsSync(macOSServiceRuntimePath())) {
    await execWithElevation('/bin/rm', ['-f', macOSServiceRuntimePath()])
  }
}

async function installMacOSService(): Promise<void> {
  const previousStatus = macOSServiceRegistrationStatus()
  await removeLegacyMacOSService()
  const status = registerMacOSService()
  if (status === 'requires-approval') {
    openMacOSServiceSystemSettings()
  } else if (previousStatus === 'enabled') {
    await restartService()
  }
}

export async function initService(): Promise<void> {
  const currentKeyManager = await initKeyManager()
  const secret = await ensurePersistedServiceAuth(currentKeyManager)
  const execPath = servicePath()

  let commandError: unknown
  try {
    const principalArgs = await getAuthorizedPrincipalArgs()
    await execWithElevation(execPath, [
      'service',
      'init',
      '--public-key',
      secret.publicKey,
      ...principalArgs
    ])
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    commandError = error
  }

  if (process.platform === 'darwin' && commandError) {
    // Older service binaries try to restart through a legacy plist after
    // writing authentication state. Restart the SMAppService job explicitly.
    try {
      await restartService()
      await waitForServiceReady()
      return
    } catch (error) {
      throw new Error(
        tr('服务初始化失败：{0}', [serviceCommandErrorMessage(commandError ?? error)])
      )
    }
  }

  if (commandError) {
    throw new Error(tr('服务初始化失败：{0}', [serviceCommandErrorMessage(commandError)]))
  }

  await waitForServiceReady()
}

export async function installService(): Promise<void> {
  const execPath = servicePath()

  try {
    if (process.platform === 'darwin') {
      await installMacOSService()
    } else {
      await execWithElevation(execPath, ['service', 'install'])
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('服务安装失败：{0}', [serviceCommandErrorMessage(error)]))
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
    throw new Error(tr('请在系统设置中允许 KokoroBox 后台服务'))
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
      await execWithElevation(execPath, ['service', 'uninstall'])
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('服务卸载失败：{0}', [serviceCommandErrorMessage(error)]))
  }
}

export async function startService(): Promise<void> {
  const execPath = servicePath()

  try {
    if (process.platform === 'darwin') {
      await execWithElevation('/bin/launchctl', ['kickstart', 'system/KokoroBoxService'])
    } else {
      await execWithElevation(execPath, ['service', 'start'])
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('服务启动失败：{0}', [serviceCommandErrorMessage(error)]))
  }
}

export async function stopService(): Promise<void> {
  const execPath = servicePath()

  try {
    if (process.platform === 'darwin') {
      await execWithElevation('/bin/launchctl', ['kill', 'SIGTERM', 'system/KokoroBoxService'])
    } else {
      await execWithElevation(execPath, ['service', 'stop'])
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('服务停止失败：{0}', [serviceCommandErrorMessage(error)]))
  }
}

export async function restartService(): Promise<void> {
  const execPath = servicePath()

  try {
    if (process.platform === 'darwin') {
      await execWithElevation('/bin/launchctl', ['kickstart', '-k', 'system/KokoroBoxService'])
    } else {
      await execWithElevation(execPath, ['service', 'restart'])
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new UserCancelledError()
    }
    throw new Error(tr('服务重启失败：{0}', [serviceCommandErrorMessage(error)]))
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

  try {
    const { stdout, stderr } = await execFilePromise(execPath, ['service', 'status'], {
      windowsHide: true
    })
    commandState = parseServiceLog(`${stdout}\n${stderr}`)?.status?.state
  } catch (error) {
    commandState = parseServiceLog(serviceCommandOutput(error))?.status?.state
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
      return 'running'
    } catch (error) {
      if (
        error instanceof ServiceAPIError &&
        error.status !== undefined &&
        [401, 403, 409, 503].includes(error.status)
      ) {
        return 'need-init'
      }
      return commandState === 'running' ? 'running' : 'unknown'
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
  openMacOSServiceSystemSettings()
}

export async function testServiceConnection(): Promise<boolean> {
  try {
    await test()
    return true
  } catch {
    return false
  }
}
