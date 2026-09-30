// Structured contracts at the two independent diagnostic boundaries.
// Kept structural so older Native packages can report unavailable instead of
// executing a Desktop fallback. Mirrors kokorobox-native's public declarations.
export interface ProxyEndpoint {
  host: string
  port: number
}
export interface MacProxyProtocol {
  enabled: boolean
  endpoint?: ProxyEndpoint | null
}
export interface MacProxyState {
  http: MacProxyProtocol
  https: MacProxyProtocol
  socks: MacProxyProtocol
  pacEnabled: boolean
  pacUrl?: string | null
  autoDiscovery: boolean
  bypass: string[]
  excludeSimpleHostnames: boolean
}
export interface MacNetworkService {
  id: string
  name: string
  interface?: string | null
  enabled: boolean
  active: boolean
  primary: boolean
  status: 'available' | 'unavailable'
  proxies?: MacProxyState | null
}
export interface MacOSProxyDetails {
  effective?: MacProxyState | null
  activeServiceIds: string[]
  services: MacNetworkService[]
  networkLocation?: string | null
  locationErrorCode?: string | null
  serviceErrorCode?: string | null
}
export interface NativeSystemProxyMutation {
  automaticSettingsPreserved: boolean
}
export interface NativeSystemProxyDiagnostics {
  platform: 'windows' | 'darwin' | 'linux'
  status: 'available' | 'unavailable' | 'unsupported'
  errorCode?: string | null
  enabled?: boolean | null
  proxies: {
    http?: ProxyEndpoint | null
    https?: ProxyEndpoint | null
    socks?: ProxyEndpoint | null
  }
  pac?: { enabled: boolean; url?: string | null } | null
  bypass: string[]
  macos?: MacOSProxyDetails | null
  linux?: {
    desktopEnvironment: string
    backend: 'gnome' | 'kde' | 'environment' | 'unsupported'
    mode?: 'none' | 'manual' | 'auto' | 'wpad' | 'environment' | null
    reversedBypass: boolean
    environment: {
      name: string
      endpoint?: ProxyEndpoint | null
      bypass: string[]
      valid: boolean
    }[]
    portal: {
      status: 'available' | 'unavailable'
      direct: boolean
      proxies: ProxyEndpoint[]
      errorCode?: string | null
    }
  } | null
  windows?: {
    proxyServer?: string | null
    proxyOverride?: string | null
    autoConfigUrl?: string | null
    winHttp: {
      status: 'available' | 'unavailable'
      mode?: 'direct' | 'proxy' | 'advanced' | null
      proxy?: string | null
      bypass?: string | null
      errorCode?: string | null
    }
    appContainer: {
      supported: boolean
      status: 'available' | 'unavailable'
      loopbackExemptionCount?: number | null
      errorCode?: string | null
    }
  } | null
}
export interface NativeSystemProxySettings {
  mode: 'manual' | 'auto' | 'disabled'
  host?: string
  port?: number
  bypass: string[]
  pacUrl?: string
  onlyActiveDevice?: boolean
}
export interface ProxyRuntimeDiagnostics {
  core: { running: boolean | null; ready: boolean; errorCode?: string }
  proxy: { host: string; port: number | null }
  listener: { available: boolean; errorCode?: string }
  connectivity: {
    available: boolean
    outcome: 'success' | 'unreachable' | 'outbound-failed'
    latencyMs?: number
    errorCode?: string
  }
}

export function validateProxyRuntimeDiagnostics(value: unknown): ProxyRuntimeDiagnostics {
  if (!value || typeof value !== 'object') throw new Error('Invalid proxy runtime diagnostics')
  const v = value as ProxyRuntimeDiagnostics
  if (
    !v.core ||
    !v.proxy ||
    !v.listener ||
    !v.connectivity ||
    ![true, false, null].includes(v.core.running) ||
    typeof v.core.ready !== 'boolean' ||
    !['127.0.0.1', 'localhost', '::1'].includes(v.proxy.host) ||
    (v.proxy.port !== null &&
      (!Number.isInteger(v.proxy.port) || v.proxy.port < 1 || v.proxy.port > 65535)) ||
    typeof v.listener.available !== 'boolean' ||
    typeof v.connectivity.available !== 'boolean' ||
    !['success', 'unreachable', 'outbound-failed'].includes(v.connectivity.outcome) ||
    v.connectivity.available !== (v.connectivity.outcome === 'success')
  ) {
    throw new Error('Invalid proxy runtime diagnostics')
  }
  // Do not pass service extensions (or accidentally supplied private config) on.
  return {
    core: { running: v.core.running, ready: v.core.ready, errorCode: v.core.errorCode },
    proxy: { host: v.proxy.host, port: v.proxy.port },
    listener: { available: v.listener.available, errorCode: v.listener.errorCode },
    connectivity: {
      available: v.connectivity.available,
      outcome: v.connectivity.outcome,
      latencyMs: v.connectivity.latencyMs,
      errorCode: v.connectivity.errorCode
    }
  }
}
