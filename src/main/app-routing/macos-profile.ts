import os from 'os'
import { appRoutingIdentifierKind, validateAppRoutingConfig } from '../../shared/app-routing'
import { appRoutingSocksPort } from './profile'

export interface MacBridgeConfiguration {
  version: 1
  failClosed: true
  proxyAvailable: boolean
  proxyHost: '127.0.0.1'
  proxyPort: 7891
  diagnosticLogging: boolean
  rules: Array<{
    signingIdentifier: string
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
    (rule) => rule.enabled && appRoutingIdentifierKind(rule) !== 'macos-signing-identifier'
  )
  if (invalidRule) {
    throw new Error('macOS application routing requires signing-identifier rules')
  }
  return {
    version: 1,
    failClosed: true,
    proxyAvailable,
    proxyHost: '127.0.0.1',
    proxyPort: appRoutingSocksPort,
    diagnosticLogging: config.diagnosticLogging,
    rules: config.rules
      .filter((rule) => appRoutingIdentifierKind(rule) === 'macos-signing-identifier')
      .sort((a, b) => a.priority - b.priority)
      .map((rule) => ({
        signingIdentifier: rule.processPattern,
        ruleProtocol: protocolValue(rule.protocol),
        action: (rule.action === 'proxy' && !proxyAvailable
          ? 'BLOCK'
          : rule.action.toUpperCase()) as 'PROXY' | 'DIRECT' | 'BLOCK',
        enabled: rule.enabled,
        priority: rule.priority
      }))
  }
}
