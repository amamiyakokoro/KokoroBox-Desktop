import * as native from 'kokorobox-native'
import { isIP } from 'node:net'
import { validateDNSResolutionDiagnostics } from '../../shared/proxy-diagnostics-contract'
import type {
  NativeSystemDNSDiagnostics,
  NativeSystemProxyDiagnostics,
  NativeSystemProxyMutation,
  NativeSystemProxySettings
} from '../../shared/proxy-diagnostics-contract'

// Older native binaries expose neither API. Never fall back to registry commands.
const systemProxy = native as unknown as {
  getSystemDnsDiagnostics?: () => Promise<NativeSystemDNSDiagnostics>
  getSystemProxyDiagnostics?: () => Promise<NativeSystemProxyDiagnostics>
  setSystemProxy?: (
    settings: NativeSystemProxySettings
  ) => Promise<NativeSystemProxyMutation | void>
}

export async function getNativeSystemDNSDiagnostics(): Promise<NativeSystemDNSDiagnostics> {
  if (!systemProxy.getSystemDnsDiagnostics) throw new Error('native-dns-unavailable')
  const value = await bounded(systemProxy.getSystemDnsDiagnostics(), 6000)
  const dns = validateDNSResolutionDiagnostics(value)
  if (
    !Array.isArray(value.servers) ||
    value.servers.length > 32 ||
    value.servers.some((ip) => typeof ip !== 'string' || !isIP(ip)) ||
    (value.interface != null &&
      (typeof value.interface !== 'string' || value.interface.length > 256)) ||
    (value.service != null && (typeof value.service !== 'string' || value.service.length > 256))
  ) {
    throw new Error('native-dns-response-invalid')
  }
  return {
    ...dns,
    interface: value.interface,
    service: value.service,
    servers: [...value.servers]
  }
}

export async function getNativeSystemProxyDiagnostics(): Promise<NativeSystemProxyDiagnostics> {
  if (!systemProxy.getSystemProxyDiagnostics) throw new Error('native-diagnostics-unavailable')
  return bounded(systemProxy.getSystemProxyDiagnostics(), 4000)
}

export function assertNativeSystemProxyAvailable(): void {
  if (!systemProxy.setSystemProxy) throw new Error('native-system-proxy-unavailable')
}

export async function setNativeSystemProxy(
  settings: NativeSystemProxySettings
): Promise<NativeSystemProxyMutation | void> {
  assertNativeSystemProxyAvailable()
  // Read-only diagnostics stay short. An explicit macOS repair may wait for
  // Native's existing administrator dialog (it has its own bounded deadline).
  return bounded(
    systemProxy.setSystemProxy!(settings),
    process.platform === 'darwin' ? 120000 : 4000
  )
}

function bounded<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('native-timeout')), timeoutMs)
    task.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
