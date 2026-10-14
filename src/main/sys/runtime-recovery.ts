import { getAppConfig } from '../config/app'
import { getAppRoutingConfig } from '../app-routing/config'
import { getAppRoutingStatus } from '../app-routing/manager'
import { isAppRoutingRuleEffectivelyEnabled } from '../../shared/app-routing'
import { serviceStatus } from '../service/manager'
import { getProxyRuntimeDiagnostics } from '../service/api'
import { proxyRuntimeDiagnosticsFailure } from '../../shared/proxy-diagnostics-contract'
import type { RuntimeRecoverySnapshot } from '../../shared/runtime-recovery'

let pending: Promise<RuntimeRecoverySnapshot> | undefined
export function getRuntimeRecoverySnapshot(): Promise<RuntimeRecoverySnapshot> {
  pending ??= readSnapshot().finally(() => {
    pending = undefined
  })
  return pending
}
async function readSnapshot(): Promise<RuntimeRecoverySnapshot> {
  const config = await getAppConfig()
  const coreMode = config.corePermissionMode === 'service' ? 'service' : 'direct'
  const [service, runtime, routingConfig] = await Promise.allSettled([
    serviceStatus(true),
    getProxyRuntimeDiagnostics(coreMode !== 'service', false),
    getAppRoutingConfig()
  ])
  if (routingConfig.status === 'rejected') throw routingConfig.reason
  const routing = routingConfig.value
  const rules = routing.rules.filter((rule) => isAppRoutingRuleEffectivelyEnabled(routing, rule))
  const latest = await getAppConfig()
  const modeChanged = (latest.corePermissionMode === 'service') !== (coreMode === 'service')
  return {
    checkedAt: new Date().toISOString(),
    platform: process.platform,
    coreMode: latest.corePermissionMode === 'service' ? 'service' : 'direct',
    service: service.status === 'fulfilled' ? service.value : 'unknown',
    serviceRequired:
      latest.corePermissionMode === 'service' ||
      latest.sysProxy.enable ||
      latest.autoSetDNSMode === 'service' ||
      (process.platform !== 'darwin' && routing.enabled && rules.length > 0),
    core:
      modeChanged || runtime.status === 'rejected'
        ? 'unknown'
        : runtime.value.core.running === false
          ? 'stopped'
          : runtime.value.core.running === true
            ? runtime.value.core.ready ||
              runtime.value.core.errorCode === 'runtime-port-unavailable'
              ? 'running'
              : 'not-ready'
            : 'unknown',
    coreError:
      !modeChanged && runtime.status === 'fulfilled'
        ? (runtime.value.core.errorCode ?? undefined)
        : undefined,
    readError:
      !modeChanged && runtime.status === 'rejected'
        ? proxyRuntimeDiagnosticsFailure(runtime.reason)
        : undefined,
    proxy: {
      required: latest.sysProxy.enable,
      port: !modeChanged && runtime.status === 'fulfilled' ? runtime.value.proxy.port : null,
      available:
        !modeChanged && runtime.status === 'fulfilled' && runtime.value.core.running === true
          ? runtime.value.listener.available
          : null
    },
    routing: {
      enabled: routing.enabled,
      hasRules: rules.length > 0,
      requiresProxy: rules.some((rule) => rule.action === 'proxy'),
      status: getAppRoutingStatus()
    }
  }
}
