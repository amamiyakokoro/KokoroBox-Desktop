export interface OverviewServiceFeature {
  kind: 'proxy' | 'dns' | 'app-routing'
  count?: number
}

export function configuredOverviewServiceFeatures(options: {
  serviceRunning: boolean
  proxyEnabled: boolean
  dnsConfigured: boolean
  platform: NodeJS.Platform
  tunEnabled: boolean
  coreRunning: boolean
  appRoutingRunning: boolean
  protectedApplicationCount?: number
}): OverviewServiceFeature[] {
  if (!options.serviceRunning) return []
  const features: OverviewServiceFeature[] = []
  if (options.proxyEnabled) features.push({ kind: 'proxy' })
  // Desktop only requests a Service DNS lease for macOS TUN. The chip describes
  // the active configuration; a separate lease-status API is not available here.
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
