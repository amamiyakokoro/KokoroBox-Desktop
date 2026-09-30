import { getAppConfig, getControledMihomoConfig } from '../config'
import { getCoreRunningForDiagnostics, startCore, restartCore } from '../core/manager'
import { mihomoConfigForDiagnostics } from '../core/mihomoApi'
import { getActivePacUrl } from '../resolve/server'
import { appendAppLog } from '../utils/log'
import { changeSysProxy } from './sysproxy-operation'
import { defaultSystemProxyBypass, normalizeProxyHost } from '../../shared/system-proxy'
import {
  buildSystemProxyDiagnostics,
  safeProxyAddress,
  type DiagnosticAction,
  type SystemProxyDiagnosticInput,
  type SystemProxyDiagnostics
} from '../../shared/system-proxy-diagnostics'
import { probeProxyConnectivity, probeProxyListener } from './system-proxy-probes'
import {
  readLoopbackExemptionCount,
  readWindowsUserProxy,
  readWinHttpProxy
} from './platform/windows-system-proxy'

let running: Promise<SystemProxyDiagnostics> | undefined
let repair: Promise<void> | undefined

function log(message: string): void {
  void appendAppLog(`[SystemProxyDiagnostics] ${message}\n`).catch(() => {})
}

// Coalesce concurrent opens/refreshes. No timer and no background connectivity probes.
export function runSystemProxyDiagnostics(): Promise<SystemProxyDiagnostics> {
  if (repair) return repair.then(() => runSystemProxyDiagnostics())
  if (!running) {
    running = runChecks().finally(() => {
      running = undefined
    })
  }
  return running
}

async function runChecks(): Promise<SystemProxyDiagnostics> {
  const { sysProxy } = await getAppConfig()
  const { 'mixed-port': expectedPort = 7890 } = await getControledMihomoConfig()
  const host = normalizeProxyHost(sysProxy.host || '')
  const expectedProxy = `${host}:${expectedPort}`
  const probeHost = host.replace(/^\[|\]$/g, '')
  const input: SystemProxyDiagnosticInput = {
    platform: process.platform,
    intentEnabled: sysProxy.enable,
    mode: sysProxy.mode || 'manual',
    expectedProxy,
    expectedPort,
    expectedBypass: sysProxy.bypass ?? defaultSystemProxyBypass(process.platform),
    expectedPacUrl: getActivePacUrl(),
    listenerAvailable: false,
    coreRunning: null,
    connectivity: { outcome: 'unreachable' }
  }
  log(`Expected proxy: ${safeProxyAddress(expectedProxy)}`)
  // A. Actual user configuration, never the toggle/lease confirmation.
  if (process.platform === 'win32') {
    try {
      input.windowsProxy = await readWindowsUserProxy()
      log(`Windows proxy: ${input.windowsProxy.enabled ? 'enabled' : 'disabled'}`)
    } catch {
      log('Windows proxy: read unavailable')
    }
  }
  // B. A successful TCP handshake only establishes listener availability.
  input.listenerAvailable = await probeProxyListener(probeHost, expectedPort)
  log(`Local listener ${input.listenerAvailable ? 'reachable' : 'unavailable'}`)
  // C. Reuse core manager state, then inspect the live controller configuration.
  input.coreRunning = await getCoreRunningForDiagnostics()
  try {
    const config = await mihomoConfigForDiagnostics()
    if (typeof config['mixed-port'] === 'number') input.runtimePort = config['mixed-port']
    // A responsive live controller proves a core is running even if service status is unknown.
    input.coreRunning = true
  } catch {
    log('Core runtime configuration: unavailable')
  }
  // D. Independently open an HTTPS CONNECT tunnel and validate the public response.
  input.connectivity = await probeProxyConnectivity(probeHost, expectedPort)
  log(
    `Connectivity test: ${input.connectivity.outcome}${input.connectivity.reason ? ` (${input.connectivity.reason})` : ''}`
  )
  // E/F are evaluated from the registry snapshot; G/H are informational, read-only.
  if (process.platform === 'win32') {
    try {
      input.loopbackExemptions = readLoopbackExemptionCount()
    } catch {
      log('AppContainer inspection: unavailable')
    }
    try {
      input.winHttp = await readWinHttpProxy()
    } catch {
      log('WinHTTP inspection: unavailable')
    }
  }
  const result = buildSystemProxyDiagnostics(input)
  for (const check of result.results) log(`check=${check.id} status=${check.status}`)
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
        const { sysProxy, onlyActiveDevice = false } = await getAppConfig()
        const enable = action === 'enable-system-proxy' || sysProxy.enable
        const result = await changeSysProxy(enable, onlyActiveDevice)
        if (result.phase !== 'idle' || result.confirmed !== enable)
          throw new Error(
            'System proxy change has not been confirmed. Run diagnostics again after checking service availability.'
          )
        return
      }
      case 'start-core': {
        const tasks = await startCore()
        await Promise.all(tasks)
        return
      }
      case 'restart-core':
        await restartCore()
        return
      default:
        throw new Error('Unknown system proxy diagnostic action')
    }
  })().finally(() => {
    repair = undefined
  })
  return repair
}
