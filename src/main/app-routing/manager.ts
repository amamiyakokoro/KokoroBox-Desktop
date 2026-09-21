import { BrowserWindow } from 'electron'
import {
  appRoutingSupported,
  isAppRoutingRuleEffectivelyEnabled,
  validateAppRoutingConfig
} from '../../shared/app-routing'
import { appendAppLog } from '../utils/log'
import { getAppRoutingConfig, saveAppRoutingConfig } from './config'
import { appRoutingProxyPort, appRoutingSocksPort } from './profile'
import { prepareAppRoutingConfig } from './rules'
import { canConnectToAppRoutingListener } from './health'
import {
  getProcessRouterStatus,
  repairProcessRouterFirewall,
  replaceProcessRouterRules,
  startProcessRouter,
  stopProcessRouter,
  ServiceAPIError,
  isServiceConnectionError,
  type ServiceProcessRouterStatus
} from '../service/api'
import {
  buildServiceProcessRouterRules,
  validateServiceProcessRouterStatus
} from './service-protocol'
import { reconcileMacAppRouting, stopMacAppRouting } from './macos'
import { macAppRoutingOperatingSystemSupported } from './macos-profile'

const probeIntervalMs = 3000
let monitor: NodeJS.Timeout | undefined
let stopping = false
let operation: Promise<void> | undefined
let reconcileRequested = false
let configGeneration = 0
let servicePolicyKey = ''
let serviceStopped = false
let serviceAuthenticationBlocked = false
let status: AppRoutingStatus = {
  supported: appRoutingSupported(process.platform, process.arch),
  state: appRoutingSupported(process.platform, process.arch) ? 'disabled' : 'unsupported',
  mihomoAvailable: false
}

function appRoutingStatusEquals(left: AppRoutingStatus, right: AppRoutingStatus): boolean {
  return (
    left.supported === right.supported &&
    left.state === right.state &&
    left.message === right.message &&
    left.needsUserApproval === right.needsUserApproval &&
    left.proxyPort === right.proxyPort &&
    left.mihomoAvailable === right.mihomoAvailable &&
    left.firewallReady === right.firewallReady &&
    left.protectedApplicationCount === right.protectedApplicationCount &&
    left.backend === right.backend
  )
}

function publishStatus(next: AppRoutingStatus): void {
  if (appRoutingStatusEquals(status, next)) return
  status = next
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('app-routing-status-changed', status)
  }
}

function publishServiceStatus(serviceStatus: ServiceProcessRouterStatus): void {
  const state =
    serviceStatus.state === 'blocked'
      ? 'degraded'
      : serviceStatus.state === 'stopped'
        ? 'disabled'
        : serviceStatus.state
  publishStatus({
    supported: serviceStatus.supported,
    state,
    message:
      serviceStatus.state === 'blocked'
        ? '代理核心不可用，受保护应用的网络连接已封锁'
        : serviceStatus.last_error,
    proxyPort: serviceStatus.proxy_port,
    mihomoAvailable: serviceStatus.mihomo_available,
    firewallReady: serviceStatus.firewall_ready,
    protectedApplicationCount: serviceStatus.protected_application_count,
    backend: serviceStatus.backend
  })
}

function serviceModeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof ServiceAPIError && [404, 501].includes(error.status || 0)) {
    return new Error('当前 KokoroBox Service 不支持应用分流，请更新或重新安装服务')
  }
  if (
    process.platform === 'win32' &&
    ((error instanceof ServiceAPIError && error.status === 503) ||
      message.toLowerCase().includes('service is not initialized'))
  ) {
    return new Error('KokoroBox Service 尚未初始化，请初始化服务后重试')
  }
  if (error instanceof ServiceAPIError && [401, 403, 409].includes(error.status || 0)) {
    return new Error('KokoroBox Service 认证已失效，请在内核设置中重置认证')
  }
  if (process.platform === 'linux' && isServiceConnectionError(error)) {
    return new Error('Linux 应用分流需要已安装并运行 KokoroBox Service')
  }
  if (process.platform === 'win32' && isServiceConnectionError(error)) {
    return new Error('Windows 应用分流需要已安装、初始化并运行 KokoroBox Service')
  }
  if (
    process.platform === 'linux' &&
    (message.includes('cgroup v2 unavailable') || message.includes('cgroup v1 net_cls'))
  ) {
    return new Error('系统不支持可用的 cgroup v2 或 cgroup v1 net_cls 应用分流后端')
  }
  return error instanceof Error ? error : new Error(String(error))
}

function isServiceAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    (error instanceof ServiceAPIError && [401, 403, 409, 503].includes(error.status || 0)) ||
    message.includes('key id is not registered') ||
    message.includes('service is not initialized')
  )
}

async function reconcileService(config: AppRoutingConfig): Promise<void> {
  if (serviceAuthenticationBlocked) {
    throw new Error('KokoroBox Service 认证已失效，请在内核设置中重置认证')
  }
  const policyKey = String(configGeneration)
  const platform = process.platform === 'linux' ? 'linux' : 'windows'
  const proxyPort = appRoutingProxyPort(process.platform)
  let serviceStatus: ServiceProcessRouterStatus
  try {
    if (servicePolicyKey !== policyKey || serviceStopped) {
      await replaceProcessRouterRules(buildServiceProcessRouterRules(config, proxyPort, platform))
      serviceStatus = validateServiceProcessRouterStatus(
        await startProcessRouter(),
        process.platform
      )
      servicePolicyKey = policyKey
      serviceStopped = false
    } else {
      serviceStatus = validateServiceProcessRouterStatus(
        await getProcessRouterStatus(),
        process.platform
      )
      if (serviceStatus.state === 'stopped') {
        await replaceProcessRouterRules(buildServiceProcessRouterRules(config, proxyPort, platform))
        serviceStatus = validateServiceProcessRouterStatus(
          await startProcessRouter(),
          process.platform
        )
      }
    }
  } catch (error) {
    if (isServiceAuthenticationError(error)) serviceAuthenticationBlocked = true
    throw serviceModeError(error)
  }
  publishServiceStatus(serviceStatus)
}

async function disableServiceRouter(allowUnavailable = false): Promise<void> {
  if (serviceStopped) return
  try {
    await stopProcessRouter()
  } catch (error) {
    if (isServiceAuthenticationError(error)) {
      serviceAuthenticationBlocked = true
      serviceStopped = true
      servicePolicyKey = ''
      return
    }
    if (
      !(error instanceof ServiceAPIError && [404, 501].includes(error.status || 0)) &&
      !(allowUnavailable && isServiceConnectionError(error))
    ) {
      throw error
    }
  }
  serviceStopped = true
  servicePolicyKey = ''
}

async function reconcile(): Promise<void> {
  if (!appRoutingSupported(process.platform, process.arch)) {
    publishStatus({ supported: false, state: 'unsupported', mihomoAvailable: false })
    return
  }
  if (process.platform === 'darwin' && !macAppRoutingOperatingSystemSupported()) {
    publishStatus({
      supported: false,
      state: 'unsupported',
      message: 'macOS 应用分流需要 macOS 13 或更新版本',
      mihomoAvailable: false
    })
    return
  }
  const config = await getAppRoutingConfig()
  validateAppRoutingConfig(config)
  const enabledRules = config.rules.filter((rule) =>
    isAppRoutingRuleEffectivelyEnabled(config, rule)
  )
  if (process.platform === 'darwin') {
    if (!config.enabled || enabledRules.length === 0) {
      await stopMacAppRouting()
      publishStatus({
        supported: true,
        state: 'disabled',
        message: config.enabled ? '添加或启用规则以启动应用分流' : undefined,
        mihomoAvailable: false
      })
      return
    }
    const requiresMihomo = enabledRules.some((rule) => rule.action === 'proxy')
    const mihomoAvailable = requiresMihomo
      ? await canConnectToAppRoutingListener(appRoutingSocksPort)
      : false
    publishStatus(await reconcileMacAppRouting(config, mihomoAvailable))
    return
  }
  if (!config.enabled || enabledRules.length === 0) {
    await disableServiceRouter(true).catch((error) =>
      appendAppLog(`[App routing]: failed to stop service router, ${error}\n`)
    )
    publishStatus({
      supported: true,
      state: 'disabled',
      message: config.enabled ? '添加或启用规则以启动应用分流' : undefined,
      mihomoAvailable: false
    })
    return
  }
  await reconcileService(config)
}

export function reconcileAppRouting(): Promise<void> {
  reconcileRequested = true
  if (operation) return operation
  operation = (async (): Promise<void> => {
    while (reconcileRequested) {
      if (stopping) break
      reconcileRequested = false
      try {
        await reconcile()
      } catch (error) {
        publishStatus({
          supported: appRoutingSupported(process.platform, process.arch),
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
          mihomoAvailable: false,
          firewallReady: false
        })
      }
    }
  })().finally(() => {
    operation = undefined
    // A request can arrive after the loop condition and before the finalizer.
    // Start one fresh pass instead of leaving that edge-triggered request idle.
    if (reconcileRequested && !stopping) void reconcileAppRouting()
  })
  return operation
}

export async function initializeAppRouting(): Promise<void> {
  if (!appRoutingSupported(process.platform, process.arch)) return
  stopping = false
  monitor = setInterval(() => {
    // A health poll must not enqueue another pass behind a slow OS operation.
    if (!operation) void reconcileAppRouting()
  }, probeIntervalMs)
  monitor.unref()
  // Network/System Extension activation is controlled by macOS and may wait
  // for system state. Never make application startup depend on that work.
  void reconcileAppRouting()
}

export async function replaceAppRoutingConfig(config: AppRoutingConfig): Promise<AppRoutingConfig> {
  const saved = await saveAppRoutingConfig(await prepareAppRoutingConfig(config))
  configGeneration++
  void reconcileAppRouting()
  return saved
}

export function getAppRoutingStatus(): AppRoutingStatus {
  return { ...status }
}

export function resumeAppRoutingAfterServiceInitialization(): void {
  serviceAuthenticationBlocked = false
  serviceStopped = false
  servicePolicyKey = ''
  void reconcileAppRouting()
}

export async function repairAppRoutingFirewall(): Promise<AppRoutingStatus> {
  if (process.platform !== 'win32') {
    throw new Error('应用分流防火墙修复仅支持 Windows')
  }

  // Avoid racing a repair against a scheduled reconciliation pass.
  if (operation) await operation

  const config = await getAppRoutingConfig()
  const hasActiveRules =
    config.enabled && config.rules.some((rule) => isAppRoutingRuleEffectivelyEnabled(config, rule))

  try {
    const repaired = validateServiceProcessRouterStatus(await repairProcessRouterFirewall())
    publishServiceStatus(repaired)
  } catch (error) {
    throw serviceModeError(error)
  }

  if (hasActiveRules) await reconcileAppRouting()
  return getAppRoutingStatus()
}

export async function refreshAppRoutingStatus(): Promise<AppRoutingStatus> {
  void reconcileAppRouting()
  return getAppRoutingStatus()
}

export async function stopAppRouting(): Promise<void> {
  stopping = true
  reconcileRequested = false
  if (monitor) clearInterval(monitor)
  monitor = undefined
  if (process.platform === 'darwin') await stopMacAppRouting()
  else await disableServiceRouter(true)
}
