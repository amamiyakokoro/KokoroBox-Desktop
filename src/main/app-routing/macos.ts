import { existsSync } from 'fs'
import { isAppRoutingRuleEffectivelyEnabled } from '../../shared/app-routing'
import { macAppRoutingExtensionPath, macAppRoutingModulePath } from '../utils/dirs'
import { appRoutingSocksPort } from './profile'
import { buildMacAppRoutingConfiguration, type MacBridgeConfiguration } from './macos-profile'

// Native operations have their own bounded waits. This outer limit prevents a
// broken OS callback from holding an Electron worker indefinitely.
const bridgeTimeoutMs = 90_000
let activePolicyKey = ''
let nativeBridge: MacNativeBridge | undefined

interface MacNativeBridge {
  invoke(request: string): Promise<string>
}

interface MacBridgeResponse {
  version: 1
  ok: boolean
  state: 'disabled' | 'starting' | 'running' | 'stopping' | 'error'
  needsUserApproval: boolean
  message?: string
}

function loadNativeBridge(): MacNativeBridge {
  if (nativeBridge) return nativeBridge
  const modulePath = macAppRoutingModulePath()
  if (!existsSync(modulePath)) throw new Error('macOS application-routing module is not installed')
  const nativeModule = { exports: {} } as NodeModule
  process.dlopen(nativeModule, modulePath)
  const candidate = nativeModule.exports as Partial<MacNativeBridge>
  if (typeof candidate.invoke !== 'function') {
    throw new Error('macOS application-routing module has an unsupported interface')
  }
  nativeBridge = candidate as MacNativeBridge
  return nativeBridge
}

async function invokeWithTimeout(request: string): Promise<string> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      loadNativeBridge().invoke(request),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('macOS application-routing module timed out')),
          bridgeTimeoutMs
        )
      })
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function invokeBridge(
  command: 'apply' | 'stop' | 'status' | 'open-settings',
  configuration?: MacBridgeConfiguration
): Promise<MacBridgeResponse> {
  if (command === 'apply' && !existsSync(macAppRoutingExtensionPath())) {
    throw new Error('macOS application-routing system extension is not installed')
  }
  const output = await invokeWithTimeout(
    JSON.stringify({
      version: 1,
      command,
      ...(configuration ? { configuration } : {})
    })
  )
  const response = JSON.parse(output) as MacBridgeResponse
  if (
    response.version !== 1 ||
    typeof response.ok !== 'boolean' ||
    !['disabled', 'starting', 'running', 'stopping', 'error'].includes(response.state) ||
    typeof response.needsUserApproval !== 'boolean'
  ) {
    throw new Error('Unsupported macOS application-routing module response')
  }
  if (!response.ok) throw new Error(response.message || 'macOS application routing failed')
  return response
}

export async function reconcileMacAppRouting(
  config: AppRoutingConfig,
  proxyAvailable: boolean
): Promise<AppRoutingStatus> {
  const configuration = buildMacAppRoutingConfiguration(config, proxyAvailable)
  const policyKey = JSON.stringify(configuration)
  let response = await invokeBridge('status')
  if (
    policyKey !== activePolicyKey ||
    response.state === 'disabled' ||
    response.state === 'error'
  ) {
    response = await invokeBridge('apply', configuration)
    // Starting only describes the session, not acceptance of this policy.
    // A changed policy must be retried once the provider is connected.
    activePolicyKey = response.state === 'running' ? policyKey : ''
  }
  const protectedApplicationCount = config.rules.filter(
    (rule) => isAppRoutingRuleEffectivelyEnabled(config, rule) && rule.action === 'proxy'
  ).length
  const degraded = response.state === 'running' && !proxyAvailable && protectedApplicationCount > 0
  return {
    supported: true,
    state: degraded ? 'degraded' : response.state === 'stopping' ? 'starting' : response.state,
    needsUserApproval: response.needsUserApproval,
    message: response.needsUserApproval
      ? '请在系统设置中允许 KokoroBox 网络扩展'
      : degraded
        ? '代理核心不可用，受保护应用的网络连接已封锁'
        : undefined,
    proxyPort: appRoutingSocksPort,
    mihomoAvailable: proxyAvailable,
    protectedApplicationCount
  }
}

export async function stopMacAppRouting(): Promise<void> {
  activePolicyKey = ''
  if (!existsSync(macAppRoutingModulePath())) return
  await invokeBridge('stop')
}

export async function openMacAppRoutingSystemSettings(): Promise<void> {
  if (!existsSync(macAppRoutingModulePath())) {
    throw new Error('macOS application-routing module is not installed')
  }
  if (!existsSync(macAppRoutingExtensionPath())) {
    throw new Error('macOS application-routing system extension is not installed')
  }
  await invokeBridge('open-settings')
}
