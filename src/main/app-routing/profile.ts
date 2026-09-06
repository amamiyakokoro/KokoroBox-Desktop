import { validateAppRoutingConfig } from '../../shared/app-routing'

export const appRoutingListenerName = 'kokorobox-app-routing'
export const appRoutingSocksPort = 7891
export const protectedProcessNames = Object.freeze([
  'KokoroBox.exe',
  'mihomo.exe',
  'mihomo-alpha.exe',
  'sparkle-service.exe',
  'kokorobox-process-router.exe',
  'crashpad_handler.exe',
  'elevate.exe',
  'kokorobox-desktop-windows-*-setup.exe'
])
export const protectedNetworkTargets = Object.freeze([
  '127.*.*.*',
  '169.254.*.*',
  '224.0.0.0-239.255.255.255',
  '*.*.*.255',
  '::1',
  'fe80::/10',
  'ff00::/8'
])

function toRouterProtocol(protocol: AppRoutingProtocol): 'TCP' | 'UDP' | 'BOTH' {
  return protocol.toUpperCase() as 'TCP' | 'UDP' | 'BOTH'
}

function toRouterAction(action: AppRoutingAction): 'PROXY' | 'DIRECT' | 'BLOCK' {
  return action.toUpperCase() as 'PROXY' | 'DIRECT' | 'BLOCK'
}

export function buildProcessRouterCommand(
  config: AppRoutingConfig,
  proxyAvailable: boolean
): string {
  validateAppRoutingConfig(config)
  return JSON.stringify({
    version: 1,
    command: 'replace_rules',
    proxy: { host: '127.0.0.1', port: appRoutingSocksPort },
    failClosed: true,
    proxyUdpDns: config.proxyUdpDns,
    diagnosticLogging: config.diagnosticLogging,
    rules: [...config.rules]
      .sort((a, b) => a.priority - b.priority)
      .map((rule) => ({
        processPattern: rule.processPattern,
        protocol: toRouterProtocol(rule.protocol),
        action: toRouterAction(rule.action === 'proxy' && !proxyAvailable ? 'block' : rule.action),
        enabled: rule.enabled,
        priority: rule.priority
      }))
  })
}

export function applyAppRoutingListener(profile: MihomoConfig, enabled: boolean): void {
  const existing = (profile.listeners || []).filter(
    (listener) => listener.name !== appRoutingListenerName
  )

  if (enabled) {
    existing.push({
      name: appRoutingListenerName,
      type: 'socks',
      port: appRoutingSocksPort,
      listen: '127.0.0.1',
      udp: true
    })
  }

  if (existing.length > 0) profile.listeners = existing
  else delete profile.listeners
}
