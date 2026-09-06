const validActions = new Set<AppRoutingAction>(['proxy', 'direct', 'block'])
const validProtocols = new Set<AppRoutingProtocol>(['tcp', 'udp', 'both'])
const reservedProcessNames = new Set([
  'kokorobox.exe',
  'mihomo.exe',
  'mihomo-alpha.exe',
  'clash.exe',
  'clash-meta.exe',
  'mihomo-windows-amd64.exe',
  'proxybridge_cli.exe',
  'kokorobox-proxybridge.exe'
])

export const defaultAppRoutingConfig: AppRoutingConfig = {
  version: 1,
  enabled: false,
  rules: []
}

export function appRoutingSupported(platform: NodeJS.Platform, arch: string): boolean {
  return platform === 'win32' && arch === 'x64'
}

export function executableName(executablePath: string): string {
  const normalized = executablePath.replaceAll('/', '\\')
  return normalized.slice(normalized.lastIndexOf('\\') + 1)
}

export function validateAppRoutingRule(rule: AppRoutingRule): void {
  if (!rule.id || rule.id.length > 128) throw new Error('Invalid application rule ID')
  if (!/^(?:[a-zA-Z]:\\|\\\\)[^\0]+\.exe$/i.test(rule.executablePath)) {
    throw new Error('Application routing requires an absolute Windows .exe path')
  }
  const derivedName = executableName(rule.executablePath)
  if (!derivedName || derivedName.toLowerCase() !== rule.processName.toLowerCase()) {
    throw new Error('Application rule process name does not match its executable path')
  }
  if (reservedProcessNames.has(derivedName.toLowerCase())) {
    throw new Error(`${derivedName} cannot be intercepted`)
  }
  if (!validActions.has(rule.action)) throw new Error('Invalid application routing action')
  if (!validProtocols.has(rule.protocol)) throw new Error('Invalid application routing protocol')
  if (typeof rule.enabled !== 'boolean') throw new Error('Invalid application rule state')
}

export function validateAppRoutingConfig(config: AppRoutingConfig): void {
  if (!config || config.version !== 1 || typeof config.enabled !== 'boolean') {
    throw new Error('Invalid application routing configuration')
  }
  if (!Array.isArray(config.rules) || config.rules.length > 256) {
    throw new Error('Application routing supports at most 256 rules')
  }
  const ids = new Set<string>()
  const processNames = new Set<string>()
  for (const rule of config.rules) {
    validateAppRoutingRule(rule)
    const processName = rule.processName.toLowerCase()
    if (ids.has(rule.id)) throw new Error('Application rule IDs must be unique')
    if (processNames.has(processName)) {
      throw new Error(`Only one rule can target ${rule.processName}`)
    }
    ids.add(rule.id)
    processNames.add(processName)
  }
}

function toProxyBridgeProtocol(protocol: AppRoutingProtocol): 'TCP' | 'UDP' | 'BOTH' {
  return protocol.toUpperCase() as 'TCP' | 'UDP' | 'BOTH'
}

function toProxyBridgeAction(action: AppRoutingAction): 'PROXY' | 'DIRECT' | 'BLOCK' {
  return action.toUpperCase() as 'PROXY' | 'DIRECT' | 'BLOCK'
}

export function resolveMihomoSocksPort(config: Partial<MihomoConfig>): number | undefined {
  for (const candidate of [config['socks-port'], config['mixed-port']]) {
    if (
      typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate > 0 &&
      candidate <= 65535
    ) {
      return candidate
    }
  }
  return undefined
}

export function buildProxyBridgeProfile(config: AppRoutingConfig, proxyPort: number): string {
  validateAppRoutingConfig(config)
  if (!Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535) {
    throw new Error('A valid local Mihomo SOCKS5 port is required')
  }

  return JSON.stringify(
    {
      Version: '1.0',
      LocalhostViaProxy: false,
      IsTrafficLoggingEnabled: false,
      ProxyConfigs: [
        {
          Id: 1,
          Type: 'socks5',
          Host: '127.0.0.1',
          Port: String(proxyPort),
          Username: '',
          Password: '',
          SendDomainToProxy: true
        }
      ],
      ProxyRules: config.rules.map((rule) => ({
        ProcessName: rule.processName,
        TargetHosts: '*',
        TargetPorts: '*',
        TargetDomains: '*',
        Protocol: toProxyBridgeProtocol(rule.protocol),
        Action: toProxyBridgeAction(rule.action),
        IsEnabled: rule.enabled,
        ProxyConfigId: rule.action === 'proxy' ? 1 : 0
      }))
    },
    null,
    2
  )
}
