import type { ServiceProcessRouterRules, ServiceProcessRouterStatus } from '../service/api'
import {
  appRoutingExecutableName,
  appRoutingIdentifierKind,
  isAppRoutingRuleEffectivelyEnabled
} from '../../shared/app-routing'

const serviceStates = new Set(['stopped', 'starting', 'running', 'blocked', 'error'])

export function buildServiceProcessRouterRules(
  config: AppRoutingConfig,
  proxyPort: number,
  platform: 'windows' | 'linux' = 'windows'
): ServiceProcessRouterRules {
  return {
    version: 1,
    platform,
    proxy_port: proxyPort,
    fail_closed: true,
    proxy_udp_dns: config.proxyUdpDns,
    diagnostic_logging: config.diagnosticLogging,
    rules: config.rules.map((rule) => {
      const identifierKind = appRoutingIdentifierKind(rule)
      const matchesProcessName = identifierKind === 'linux-process-name'
      return {
        id: rule.id,
        ...(matchesProcessName ? { match_kind: 'process_name' as const } : {}),
        executable_path: matchesProcessName ? (rule.sourcePath ?? '') : rule.processPattern,
        executable_name: appRoutingExecutableName(rule.processPattern, identifierKind),
        protocol: rule.protocol,
        action: rule.action,
        enabled: isAppRoutingRuleEffectivelyEnabled(config, rule),
        priority: rule.priority
      }
    })
  }
}

export function validateServiceProcessRouterStatus(
  value: ServiceProcessRouterStatus,
  platform: NodeJS.Platform = process.platform
): ServiceProcessRouterStatus {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.supported !== 'boolean' ||
    !serviceStates.has(value.state) ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 0 ||
    typeof value.mihomo_available !== 'boolean' ||
    typeof value.firewall_ready !== 'boolean' ||
    !Number.isSafeInteger(value.protected_application_count) ||
    value.protected_application_count < 0
  ) {
    throw new Error('Unsupported KokoroBox Service process-router protocol')
  }
  const expectedPort = platform === 'linux' ? 7894 : 7891
  if (value.proxy_port !== undefined && value.proxy_port !== expectedPort) {
    throw new Error('KokoroBox Service returned an unexpected proxy port')
  }

  if (value.backend !== undefined && typeof value.backend !== 'string') {
    throw new Error('KokoroBox Service returned an invalid application-routing backend')
  }
  if (['running', 'blocked'].includes(value.state) && !value.firewall_ready) {
    throw new Error('KokoroBox Service reported application routing without firewall protection')
  }
  return value
}
