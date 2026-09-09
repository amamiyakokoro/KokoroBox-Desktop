export const TRAFFIC_MONITOR_VERSION = 'V1.86'

type TrafficMonitorAsset = {
  filename: string
  sha256: string
}

const TRAFFIC_MONITOR_ASSETS: Record<string, TrafficMonitorAsset> = {
  x64: {
    filename: 'TrafficMonitor_V1.86_x64_Lite.zip',
    sha256: 'd9774a64268f952b5cb88a1eead399f863f7d4ab64e945f19c096fed89cc1145'
  },
  arm64: {
    filename: 'TrafficMonitor_V1.86_arm64ec_Lite.zip',
    sha256: '1f20b98240784de2f85d466391c5926ffe6ea3afff77ee338bf5e34aa1fc5bc4'
  },
  ia32: {
    filename: 'TrafficMonitor_V1.86_x86_Lite.zip',
    sha256: '61ba6b0eecbacac1895176e96ddaf14950c109cda69a1638fd68edb3498c1caa'
  }
}

export function trafficMonitorAsset(arch: string): TrafficMonitorAsset {
  const asset = TRAFFIC_MONITOR_ASSETS[arch]
  if (!asset) throw new Error(`TrafficMonitor does not support architecture: ${arch}`)
  return asset
}

export function trafficMonitorDownloadUrl(asset: TrafficMonitorAsset): string {
  return `https://github.com/zhongyang219/TrafficMonitor/releases/download/${TRAFFIC_MONITOR_VERSION}/${asset.filename}`
}
