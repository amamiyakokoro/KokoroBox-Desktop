export interface OverviewConfiguredFeature {
  kind: 'proxy' | 'dns' | 'app-routing'
  count?: number
}

export function configuredOverviewFeatures(options: {
  proxyEnabled: boolean
  dnsConfigured: boolean
  platform: NodeJS.Platform
  tunEnabled: boolean
  coreRunning: boolean
  appRoutingRunning: boolean
  protectedApplicationCount?: number
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
  if (options.appRoutingRunning) {
    features.push({ kind: 'app-routing', count: options.protectedApplicationCount })
  }
  return features
}
