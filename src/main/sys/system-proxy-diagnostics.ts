import { migrateCoreToServiceForDiagnostics } from '../core/manager'
import { getAppConfig } from '../config'
import { startCore, restartCore, getProxyRuntimeDiagnostics } from '../service/api'
import { getActivePacUrl, startPacServer } from '../resolve/server'
import { localPacUrl } from '../resolve/pac-http-server'
import { appendAppLog } from '../utils/log'
import { changeSysProxy } from './sysproxy-operation'
import { applyNativeDiagnosticProxy } from './sysproxy'
import { getNativeSystemProxyDiagnostics } from './native-system-proxy'
import { defaultSystemProxyBypass } from '../../shared/system-proxy'
import { buildLinuxSystemProxyDiagnostics } from '../../shared/linux-system-proxy-diagnostics'
import { buildMacOSSystemProxyDiagnostics } from '../../shared/macos-system-proxy-diagnostics'
import {
  buildSystemProxyDiagnostics,
  type DiagnosticAction,
  type SystemProxyDiagnosticInput,
  type SystemProxyDiagnostics
} from '../../shared/system-proxy-diagnostics'
import {
  proxyRuntimeDiagnosticsFailure,
  type NativeSystemProxyDiagnostics,
  type ProxyRuntimeDiagnostics,
  type ProxyRuntimeDiagnosticsFailure
} from '../../shared/proxy-diagnostics-contract'

let running: Promise<SystemProxyDiagnostics> | undefined
let repair: Promise<void> | undefined

function log(message: string): void {
  void appendAppLog(`[SystemProxyDiagnostics] ${message}\n`).catch(() => {})
}

// Coalesce concurrent opens/refreshes. No timer or background connectivity probes.
export function runSystemProxyDiagnostics(): Promise<SystemProxyDiagnostics> {
  if (repair) return repair.then(() => runSystemProxyDiagnostics())
  if (!running)
    running = runChecks().finally(() => {
      running = undefined
    })
  return running
}

export function combineSystemProxyDiagnostics(
  input: Pick<
    SystemProxyDiagnosticInput,
    | 'platform'
    | 'intentEnabled'
    | 'mode'
    | 'expectedBypass'
    | 'expectedPacUrl'
    | 'coreRemediationUsesService'
  >,
  native?: NativeSystemProxyDiagnostics,
  runtime?: ProxyRuntimeDiagnostics,
  runtimeFailure?: ProxyRuntimeDiagnosticsFailure
): SystemProxyDiagnostics {
  const port = runtime?.proxy.port ?? null
  const host = runtime?.proxy.host ?? '127.0.0.1'
  const windows = native?.windows
  const current =
    native?.status === 'available' && typeof native.enabled === 'boolean' && windows
      ? {
          enabled: native.enabled,
          server: windows.proxyServer ?? '',
          override: windows.proxyOverride ?? '',
          pacUrl: windows.autoConfigUrl ?? ''
        }
      : undefined
  const diagnosticInput: SystemProxyDiagnosticInput = {
    ...input,
    expectedPort: port,
    expectedProxy: port ? `${host.includes(':') ? `[${host}]` : host}:${port}` : '',
    windowsProxy: current,
    listenerAvailable: runtime?.listener.available ?? false,
    coreRunning: runtime?.core.running ?? null,
    runtimePort: runtime?.core.ready && port ? port : undefined,
    runtimeUnavailable: !runtime,
    runtimeErrorCode: runtime?.core.errorCode ?? runtimeFailure,
    connectivity: {
      outcome: runtime?.connectivity.outcome ?? 'unreachable',
      reason:
        runtime?.connectivity.errorCode ??
        (!runtime ? (runtimeFailure ?? 'service-unavailable') : undefined)
    },
    loopbackExemptions:
      windows?.appContainer.status === 'available'
        ? (windows.appContainer.loopbackExemptionCount ?? undefined)
        : undefined,
    appContainerErrorCode:
      windows?.appContainer.status === 'unavailable' ? 'appcontainer-read-failed' : undefined,
    winHttp:
      windows?.winHttp.status === 'available'
        ? { mode: windows.winHttp.mode ?? 'unknown', server: windows.winHttp.proxy ?? undefined }
        : undefined,
    winHttpErrorCode: windows?.winHttp.status === 'unavailable' ? 'winhttp-read-failed' : undefined
  }
  return input.platform === 'darwin'
    ? buildMacOSSystemProxyDiagnostics(diagnosticInput, native)
    : input.platform === 'linux'
      ? buildLinuxSystemProxyDiagnostics(diagnosticInput, native)
      : buildSystemProxyDiagnostics(diagnosticInput)
}

async function runChecks(): Promise<SystemProxyDiagnostics> {
  const { sysProxy, corePermissionMode } = await getAppConfig()
  // Independent domains survive one another's failure. No Desktop-side probes.
  const [native, runtime] = await Promise.allSettled([
    getNativeSystemProxyDiagnostics(),
    getProxyRuntimeDiagnostics(corePermissionMode !== 'service')
  ])
  const result = combineSystemProxyDiagnostics(
    {
      platform: process.platform,
      intentEnabled: sysProxy.enable,
      mode: sysProxy.mode || 'manual',
      expectedBypass: sysProxy.bypass ?? defaultSystemProxyBypass(process.platform),
      expectedPacUrl: getActivePacUrl(),
      coreRemediationUsesService: corePermissionMode !== 'service'
    },
    native.status === 'fulfilled' ? native.value : undefined,
    runtime.status === 'fulfilled' ? runtime.value : undefined,
    runtime.status === 'rejected' ? proxyRuntimeDiagnosticsFailure(runtime.reason) : undefined
  )
  log(
    `Diagnostics completed; platform: ${process.platform}; overall status: ${result.overall.kind}${runtime.status === 'rejected' ? `; runtime: ${proxyRuntimeDiagnosticsFailure(runtime.reason)}` : ''}`
  )
  return result
}

/** Each mutation is invoked only by an explicit, labeled action in diagnostics. */
export function fixSystemProxyDiagnostic(action: DiagnosticAction): Promise<void> {
  if (repair) return repair
  repair = (async () => {
    if (running) await running
    switch (action) {
      case 'enable-system-proxy':
      case 'restore-system-proxy': {
        if (process.platform === 'linux')
          throw new Error('Configure the proxy in your desktop network settings')
        const { sysProxy, onlyActiveDevice = false, corePermissionMode } = await getAppConfig()
        const enable = action === 'enable-system-proxy' || sysProxy.enable
        const mode = sysProxy.mode || 'manual'
        // Fetch the service's current endpoint again; never repair with stale UI config.
        const runtime = enable
          ? await getProxyRuntimeDiagnostics(corePermissionMode !== 'service', false)
          : undefined
        if (enable && !runtime?.proxy.port)
          throw new Error(
            'Core runtime proxy port is unavailable. Start the core and run diagnostics again.'
          )
        const pacPort = enable && mode === 'auto' ? await startPacServer() : undefined
        if (enable && mode === 'auto' && pacPort === undefined)
          throw new Error('PAC server did not start')
        const result = await changeSysProxy(enable, onlyActiveDevice, async () => {
          await applyNativeDiagnosticProxy(
            {
              mode: enable ? mode : 'disabled',
              host: runtime?.proxy.host,
              port: runtime?.proxy.port ?? undefined,
              bypass: sysProxy.bypass ?? defaultSystemProxyBypass(process.platform),
              pacUrl: pacPort === undefined ? undefined : localPacUrl(pacPort)
            },
            onlyActiveDevice,
            !!sysProxy.guard,
            !!sysProxy.guardNotify
          )
          return 'applied'
        })
        if (result.phase !== 'idle' || result.confirmed !== enable)
          throw new Error('System proxy change has not been confirmed. Run diagnostics again.')
        return
      }
      case 'start-core':
      case 'restart-core': {
        const { corePermissionMode } = await getAppConfig()
        if (corePermissionMode !== 'service') await migrateCoreToServiceForDiagnostics()
        else if (action === 'start-core') await startCore()
        else await restartCore()
        return
      }
      default:
        throw new Error('Unknown system proxy diagnostic action')
    }
  })().finally(() => {
    repair = undefined
  })
  return repair
}
