import os from 'os'
import type { MacosApplicationRoutingConfiguration } from 'kokorobox-native'
import {
  appRoutingIdentifierKind,
  isAppRoutingRuleEffectivelyEnabled,
  validateAppRoutingConfig
} from '../../shared/app-routing'

export function macAppRoutingOperatingSystemSupported(release = os.release()): boolean {
  const darwinMajor = Number.parseInt(release.split('.')[0] || '', 10)
  return Number.isInteger(darwinMajor) && darwinMajor >= 22
}

function protocolValue(protocol: AppRoutingProtocol): 'TCP' | 'UDP' | 'BOTH' {
  return protocol.toUpperCase() as 'TCP' | 'UDP' | 'BOTH'
}

export function buildMacAppRoutingConfiguration(
  config: AppRoutingConfig,
  proxyAvailable: boolean
): MacosApplicationRoutingConfiguration {
  validateAppRoutingConfig(config)
  const invalidRule = config.rules.find(
    (rule) =>
      isAppRoutingRuleEffectivelyEnabled(config, rule) &&
      !['macos-signing-identifier', 'macos-process-name'].includes(appRoutingIdentifierKind(rule))
  )
  if (invalidRule) {
    throw new Error('macOS application routing requires typed identity rules')
  }
  return {
    proxyAvailable,
    proxyUdpDns: config.proxyUdpDns,
    diagnosticLogging: config.diagnosticLogging,
    rules: config.rules
      .filter((rule) =>
        ['macos-signing-identifier', 'macos-process-name'].includes(appRoutingIdentifierKind(rule))
      )
      .sort((a, b) => a.priority - b.priority)
      .map((rule) => ({
        signingIdentifier: rule.processPattern,
        identifierKind:
          appRoutingIdentifierKind(rule) === 'macos-process-name'
            ? 'PROCESS_NAME'
            : 'SIGNING_IDENTIFIER',
        ruleProtocol: protocolValue(rule.protocol),
        action: (rule.action === 'proxy' && !proxyAvailable
          ? 'BLOCK'
          : rule.action.toUpperCase()) as 'PROXY' | 'DIRECT' | 'BLOCK',
        enabled: isAppRoutingRuleEffectivelyEnabled(config, rule),
        priority: rule.priority
      }))
  }
}
