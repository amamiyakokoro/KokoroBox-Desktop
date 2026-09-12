import os from 'os'
import {
  appRoutingIdentifierKind,
  isAppRoutingRuleEffectivelyEnabled,
  validateAppRoutingConfig
} from '../../shared/app-routing'
import { appRoutingDnsHost, appRoutingDnsPort, appRoutingSocksPort } from './profile'

export interface MacBridgeConfiguration {
  version: 1
  failClosed: true
  proxyAvailable: boolean
  proxyHost: '127.0.0.1'
  proxyPort: 7891
  proxyUdpDns: boolean
  dnsHost: '127.0.0.1'
  dnsPort: 7892
  diagnosticLogging: boolean
  rules: Array<{
    signingIdentifier: string
    identifierKind: 'SIGNING_IDENTIFIER' | 'PROCESS_NAME'
    ruleProtocol: 'TCP' | 'UDP' | 'BOTH'
    action: 'PROXY' | 'DIRECT' | 'BLOCK'
    enabled: boolean
    priority: number
  }>
}

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
): MacBridgeConfiguration {
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
    version: 1,
    failClosed: true,
    proxyAvailable,
    proxyHost: '127.0.0.1',
    proxyPort: appRoutingSocksPort,
    proxyUdpDns: config.proxyUdpDns,
    dnsHost: appRoutingDnsHost,
    dnsPort: appRoutingDnsPort,
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
