export interface OverviewConfiguredFeature {
  kind: 'proxy' | 'dns' | 'app-routing'
  count?: number
}

export type OverviewActiveFeature =
  'tun' | 'fake-ip' | 'redir-host' | 'dns' | 'sysproxy' | 'app-routing'

export function activeOverviewFeatures(options: {
  coreRunning: boolean
  tunEnabled?: boolean
  dnsEnabled?: boolean
  dnsMode?: DnsMode
  systemProxyConfirmed: boolean | null
  appRoutingRunning: boolean
}): OverviewActiveFeature[] {
  const features: OverviewActiveFeature[] = []
  if (options.coreRunning && options.tunEnabled) features.push('tun')
  if (options.coreRunning && options.dnsEnabled) {
    features.push(
      options.dnsMode === 'fake-ip'
        ? 'fake-ip'
        : options.dnsMode === 'redir-host'
          ? 'redir-host'
          : 'dns'
    )
  }
  if (options.systemProxyConfirmed === true) features.push('sysproxy')
  if (options.coreRunning && options.appRoutingRunning) features.push('app-routing')
  return features
}

export function configuredOverviewFeatures(options: {
  proxyEnabled: boolean
  dnsConfigured: boolean
  platform: NodeJS.Platform
  tunEnabled: boolean
  coreRunning: boolean
  appRoutingConfigured: boolean
  configuredRuleCount?: number
}): OverviewConfiguredFeature[] {
  const features: OverviewConfiguredFeature[] = []
  if (options.proxyEnabled) features.push({ kind: 'proxy' })
  // Desktop only requests a DNS lease for macOS TUN. These chips describe
  // configuration, not verified ownership or an active lease.
  if (
    options.platform === 'darwin' &&
    options.dnsConfigured &&
    options.tunEnabled &&
    options.coreRunning
  ) {
    features.push({ kind: 'dns' })
  }
  if (options.appRoutingConfigured) {
    features.push({
      kind: 'app-routing',
      count:
        options.configuredRuleCount && options.configuredRuleCount > 0
          ? options.configuredRuleCount
          : undefined
    })
  }
  return features
}
