import * as native from 'kokorobox-native'
import type {
  NativeSystemProxyDiagnostics,
  NativeSystemProxyMutation,
  NativeSystemProxySettings
} from '../../shared/proxy-diagnostics-contract'

// Older native binaries expose neither API. Never fall back to registry commands.
const systemProxy = native as unknown as {
  getSystemProxyDiagnostics?: () => Promise<NativeSystemProxyDiagnostics>
  setSystemProxy?: (
    settings: NativeSystemProxySettings
  ) => Promise<NativeSystemProxyMutation | void>
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
