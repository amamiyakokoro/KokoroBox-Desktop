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
  dns?: DNSResolutionDiagnostics
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

export interface DNSResolutionDiagnostics {
  outcome: 'success' | 'failed' | 'unavailable'
  queries: { domain: string; outcome: 'success' | 'failed' | 'unavailable' }[]
}
export interface NativeSystemDNSDiagnostics extends DNSResolutionDiagnostics {
  interface?: string | null
  service?: string | null
  servers: string[]
}

export function validateDNSResolutionDiagnostics(value: unknown): DNSResolutionDiagnostics {
  const v = value as DNSResolutionDiagnostics | undefined
  const outcomes = ['success', 'failed', 'unavailable']
  if (
    !v ||
    !outcomes.includes(v.outcome) ||
    !Array.isArray(v.queries) ||
    v.queries.length !== 2 ||
    !['www.gstatic.com', 'example.com'].every(
      (domain) => v.queries.filter((q) => q?.domain === domain).length === 1
    ) ||
    v.queries.some((q) => !q || !outcomes.includes(q.outcome)) ||
    v.outcome !==
      (v.queries.some((q) => q.outcome === 'failed')
        ? 'failed'
        : v.queries.some((q) => q.outcome === 'unavailable')
          ? 'unavailable'
          : 'success')
  ) {
    throw new Error('Invalid DNS diagnostics')
  }
  return {
    outcome: v.outcome,
    queries: v.queries.map((q) => ({ domain: q.domain, outcome: q.outcome }))
  }
}

export type ProxyRuntimeDiagnosticsFailure =
  | 'service-diagnostics-unsupported'
  | 'service-authentication-required'
  | 'service-permission-denied'
  | 'service-timeout'
  | 'service-response-invalid'
  | 'service-request-failed'
  | 'service-unavailable'

/** Transport failures describe missing evidence, never a stopped or failed core.
 * Return only fixed codes; HTTP bodies, credentials and raw errors stay private. */
export function proxyRuntimeDiagnosticsFailure(error: unknown): ProxyRuntimeDiagnosticsFailure {
  const value = error as { code?: string; status?: number; response?: { status?: number } } | null
  const code = value?.code
  if (
    code &&
    [
      'service-diagnostics-unsupported',
      'service-authentication-required',
      'service-permission-denied',
      'service-timeout',
      'service-response-invalid',
      'service-request-failed',
      'service-unavailable'
    ].includes(code)
  )
    return code as ProxyRuntimeDiagnosticsFailure
  const status = value?.status ?? value?.response?.status
  if (status === 404 || status === 405) return 'service-diagnostics-unsupported'
  if (status === 401) return 'service-authentication-required'
  if (status === 403) return 'service-permission-denied'
  if (status === 408 || status === 504 || ['ECONNABORTED', 'ETIMEDOUT'].includes(code ?? ''))
    return 'service-timeout'
  if (status !== undefined) return 'service-request-failed'
  return 'service-unavailable'
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
  // An invalid optional DNS extension cannot discard independent runtime facts.
  let dns: DNSResolutionDiagnostics | undefined
  if (v.dns !== undefined) {
    try {
      dns = validateDNSResolutionDiagnostics(v.dns)
    } catch {
      /* DNS evidence unavailable. */
    }
  }
  // Do not pass service extensions (or accidentally supplied private config) on.
  return {
    ...(dns === undefined ? {} : { dns }),
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
