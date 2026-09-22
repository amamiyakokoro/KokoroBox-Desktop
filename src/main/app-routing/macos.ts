import { existsSync } from 'fs'
import {
  applyMacosApplicationRouting,
  getMacosApplicationRoutingStatus,
  openMacosApplicationRoutingSettings,
  stopMacosApplicationRouting
} from 'kokorobox-native'
import { isAppRoutingRuleEffectivelyEnabled } from '../../shared/app-routing'
import { macAppRoutingExtensionPath } from '../utils/dirs'
import { appRoutingSocksPort } from './profile'
import { buildMacAppRoutingConfiguration } from './macos-profile'

// Native operations have their own bounded waits. This outer limit prevents a
// broken OS callback from holding an Electron worker indefinitely.
const bridgeTimeoutMs = 90_000
const providerHealthCheckIntervalMs = 15_000
let activePolicyKey = ''
let lastProviderHealthCheckAt = 0

async function invokeWithTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      operation,
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

export async function reconcileMacAppRouting(
  config: AppRoutingConfig,
  proxyAvailable: boolean
): Promise<AppRoutingStatus> {
  if (!existsSync(macAppRoutingExtensionPath())) {
    throw new Error('macOS application-routing system extension is not installed')
  }
  const configuration = buildMacAppRoutingConfiguration(config, proxyAvailable)
  const policyKey = JSON.stringify(configuration)
  let response = await invokeWithTimeout(getMacosApplicationRoutingStatus())
  const providerHealthCheckDue =
    response.state === 'running' &&
    Date.now() - lastProviderHealthCheckAt >= providerHealthCheckIntervalMs
  if (
    policyKey !== activePolicyKey ||
    response.state === 'disabled' ||
    response.state === 'error' ||
    providerHealthCheckDue
  ) {
    response = await invokeWithTimeout(applyMacosApplicationRouting(configuration))
    // Starting only describes the session, not acceptance of this policy.
    // A changed policy must be retried once the provider is connected.
    activePolicyKey = response.state === 'running' ? policyKey : ''
    lastProviderHealthCheckAt = response.state === 'running' ? Date.now() : 0
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
  lastProviderHealthCheckAt = 0
  await invokeWithTimeout(stopMacosApplicationRouting())
}

export async function openMacAppRoutingSystemSettings(): Promise<void> {
  if (!existsSync(macAppRoutingExtensionPath())) {
    throw new Error('macOS application-routing system extension is not installed')
  }
  await invokeWithTimeout(openMacosApplicationRoutingSettings())
}
