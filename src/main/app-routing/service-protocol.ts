import type { ServiceProcessRouterRules, ServiceProcessRouterStatus } from '../service/api'

const serviceStates = new Set(['stopped', 'starting', 'running', 'blocked', 'error'])

export function buildServiceProcessRouterRules(
  config: AppRoutingConfig,
  proxyPort: number
): ServiceProcessRouterRules {
  return {
    version: 1,
    proxy_port: proxyPort,
    fail_closed: true,
    proxy_udp_dns: config.proxyUdpDns,
    diagnostic_logging: config.diagnosticLogging,
    rules: config.rules.map((rule) => ({
      id: rule.id,
      executable_path: rule.processPattern,
      executable_name: rule.processPattern,
      protocol: rule.protocol,
      action: rule.action,
      enabled: rule.enabled,
      priority: rule.priority
    }))
  }
}

export function validateServiceProcessRouterStatus(
  value: ServiceProcessRouterStatus
): ServiceProcessRouterStatus {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.supported !== 'boolean' ||
    !serviceStates.has(value.state) ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 0 ||
    typeof value.mihomo_available !== 'boolean' ||
    !Number.isSafeInteger(value.protected_application_count) ||
    value.protected_application_count < 0
  ) {
    throw new Error('Unsupported KokoroBox Service process-router protocol')
  }
  if (value.proxy_port !== undefined && value.proxy_port !== 7891) {
    throw new Error('KokoroBox Service returned an unexpected proxy port')
  }
  return value
}
