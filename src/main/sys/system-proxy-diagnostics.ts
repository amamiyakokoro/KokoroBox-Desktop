import {
  migrateCoreToServiceForDiagnostics,
  restartCore as restartConfiguredCore
} from '../core/manager'
import { getAppConfig, patchControledMihomoConfig } from '../config'
import { getRuntimeConfig } from '../core/factory'
import { bootstrapDNSAddresses } from './dns-bootstrap'
import { appendDNSDiagnostics, canRepairDNS, type DNSEvidence } from '../../shared/dns-diagnostics'
import { startCore, restartCore, getProxyRuntimeDiagnostics } from '../service/api'
import { getActivePacUrl, startPacServer } from '../resolve/server'
import { localPacUrl } from '../resolve/pac-http-server'
import { appendAppLog } from '../utils/log'
import { changeSysProxy } from './sysproxy-operation'
import { applyNativeDiagnosticProxy } from './sysproxy'
import {
  getNativeSystemProxyDiagnostics,
  getNativeSystemDNSDiagnostics
} from './native-system-proxy'
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
let dnsRepairPlan:
  | {
      interface: string
      service?: string | null
      expectedServers: string[]
      expectedBootstrap: string[]
      servers: string[]
    }
  | undefined

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
  runtimeFailure?: ProxyRuntimeDiagnosticsFailure,
  dns?: DNSEvidence
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
  const result =
    input.platform === 'darwin'
      ? buildMacOSSystemProxyDiagnostics(diagnosticInput, native)
      : input.platform === 'linux'
        ? buildLinuxSystemProxyDiagnostics(diagnosticInput, native)
        : buildSystemProxyDiagnostics(diagnosticInput)
  return dns ? appendDNSDiagnostics(result, dns) : result
}

async function runChecks(): Promise<SystemProxyDiagnostics> {
  dnsRepairPlan = undefined
  const { sysProxy, corePermissionMode, controlDns = true } = await getAppConfig()
  // Independent domains survive one another's failure. No Desktop-side probes.
  const [native, runtime, systemDNS, config] = await Promise.allSettled([
    getNativeSystemProxyDiagnostics(),
    getProxyRuntimeDiagnostics(corePermissionMode !== 'service'),
    getNativeSystemDNSDiagnostics(),
    getRuntimeConfig()
  ])
  const effectiveBootstrap =
    config.status === 'fulfilled' ? (config.value?.dns?.['default-nameserver'] ?? []) : []
  const replacement = bootstrapDNSAddresses(
    systemDNS.status === 'fulfilled' ? systemDNS.value.servers : []
  )
  const dns: DNSEvidence = {
    system: systemDNS.status === 'fulfilled' ? systemDNS.value : undefined,
    core: runtime.status === 'fulfilled' ? runtime.value.dns : undefined,
    bootstrap: bootstrapDNSAddresses(effectiveBootstrap),
    replacement,
    bootstrapMatchesSystem: JSON.stringify(effectiveBootstrap) === JSON.stringify(replacement),
    configurable:
      controlDns &&
      config.status === 'fulfilled' &&
      !!config.value?.dns &&
      config.value.dns.enable !== false
  }
  if (canRepairDNS(dns)) {
    dnsRepairPlan = {
      interface: dns.system!.interface!,
      service: dns.system!.service,
      expectedServers: [...dns.system!.servers],
      expectedBootstrap: [...effectiveBootstrap],
      servers: [...replacement]
    }
  }
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
    runtime.status === 'rejected' ? proxyRuntimeDiagnosticsFailure(runtime.reason) : undefined,
    dns
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
      case 'restore-bootstrap-dns': {
        const plan = dnsRepairPlan
        dnsRepairPlan = undefined
        if (!plan) throw new Error('Run DNS diagnostics before repairing DNS')
        const config = await getRuntimeConfig()
        const bootstrap = config?.dns?.['default-nameserver'] ?? []
        if (JSON.stringify(bootstrap) !== JSON.stringify(plan.expectedBootstrap))
          throw new Error('Bootstrap DNS changed. Run diagnostics again.')
        const { controlDns = true, corePermissionMode } = await getAppConfig()
        if (!controlDns) throw new Error('DNS settings are not managed by KokoroBox')
        const current = await getNativeSystemDNSDiagnostics()
        if (
          current.interface !== plan.interface ||
          current.service !== plan.service ||
          JSON.stringify(current.servers) !== JSON.stringify(plan.expectedServers)
        )
          throw new Error('System DNS changed. Run diagnostics again.')
        await patchControledMihomoConfig({ dns: { 'default-nameserver': [...plan.servers] } })
        const updated = await getRuntimeConfig()
        if (JSON.stringify(updated?.dns?.['default-nameserver']) !== JSON.stringify(plan.servers))
          throw new Error('Bootstrap DNS change was overridden by the profile')
        await restartConfiguredCore()
        const runtime = await getProxyRuntimeDiagnostics(corePermissionMode !== 'service', false)
        if (!runtime.core.ready) throw new Error('Core restart failed. Run diagnostics again.')
        return
      }
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
