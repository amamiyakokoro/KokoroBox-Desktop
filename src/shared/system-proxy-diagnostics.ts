import { tr } from './i18n'
import { defaultSystemProxyBypass } from './system-proxy'

export type DiagnosticStatus = 'success' | 'warning' | 'error' | 'info'
export type DiagnosticAction =
  | 'enable-system-proxy'
  | 'restore-system-proxy'
  | 'start-core'
  | 'restart-core'
  | 'restore-bootstrap-dns'

export interface DiagnosticResult {
  id: string
  title: string
  status: DiagnosticStatus
  summary: string
  details?: string
  action?: DiagnosticAction
  actionHint?: string
}

export interface WindowsUserProxy {
  enabled: boolean
  server: string
  override: string
  pacUrl: string
}

export interface ConnectivityResult {
  outcome: 'success' | 'unreachable' | 'outbound-failed'
  reason?: string
}

export interface SystemProxyDiagnosticInput {
  coreRemediationUsesService?: boolean
  platform: string
  intentEnabled: boolean
  mode: 'manual' | 'auto'
  expectedProxy: string
  expectedPort: number | null
  expectedBypass: string[]
  expectedPacUrl?: string
  windowsProxy?: WindowsUserProxy
  listenerAvailable: boolean
  coreRunning: boolean | null
  runtimePort?: number
  runtimeUnavailable?: boolean
  runtimeErrorCode?: string
  winHttpErrorCode?: string
  appContainerErrorCode?: string
  connectivity: ConnectivityResult
  loopbackExemptions?: number
  winHttp?: { mode: 'direct' | 'proxy' | 'advanced' | 'unknown'; server?: string }
}

export type SystemProxyOverallStatus =
  | 'healthy'
  | 'disabled'
  | 'configuration-mismatch'
  | 'core-unavailable'
  | 'listener-unavailable'
  | 'connectivity-failed'
  | 'warning'
  | 'configuration-unavailable'
  | 'runtime-unavailable'
  | 'dns-failed'

export interface SystemProxyDiagnostics {
  checkedAt: string
  overall: { status: DiagnosticStatus; summary: string; kind: SystemProxyOverallStatus }
  state: {
    intentEnabled: boolean
    enabled: boolean | null
    matchesExpectedConfig: boolean | null
    listenerAvailable: boolean | null
    coreRunning: boolean | null
    connectivityAvailable: boolean | null
  }
  results: DiagnosticResult[]
  report: string
}

function proxyEndpoints(server: string): Map<string, string> {
  const entries = new Map<string, string>()
  for (const part of server.trim().split(';')) {
    const match = /^(?:(http|https|socks|ftp)=)?([^\s;=]+)$/i.exec(part.trim())
    if (match) entries.set((match[1] || 'all').toLowerCase(), match[2].toLowerCase())
  }
  return entries
}

export function proxyAddressMatches(server: string, expected: string): boolean {
  const entries = proxyEndpoints(server)
  if (entries.size !== server.split(';').filter((part) => part.trim()).length) return false
  const value = expected.toLowerCase()
  if (entries.has('all')) return entries.size === 1 && entries.get('all') === value
  return entries.get('http') === value && entries.get('https') === value
}

// Only local endpoints and standard bypass entries are included in UI/reports/logs.
// Never forward arbitrary registry values, PAC URLs or utility error text to the renderer.
export function safeProxyAddress(server: string): string {
  if (!server.trim()) return tr('Not configured')
  const entries = proxyEndpoints(server)
  if (!entries.size) return tr('Configured (address redacted)')
  return [...entries]
    .map(([protocol, endpoint]) => {
      const local = /^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/i.test(endpoint)
      return `${protocol === 'all' ? '' : `${protocol}=`}${local ? endpoint : tr('Configured (address redacted)')}`
    })
    .join('; ')
}

export function safePacUrl(url: string): string {
  if (!url.trim()) return tr('Not configured')
  return /^http:\/\/127\.0\.0\.1:\d{1,5}\/pac$/.test(url) ? url : tr('Configured (URL redacted)')
}

function bypassEntries(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .sort()
}

export function safeProxyBypass(value: string): string {
  const standard = new Set([
    ...defaultSystemProxyBypass('win32'),
    ...defaultSystemProxyBypass('linux'),
    ...defaultSystemProxyBypass('darwin'),
    '127.0.0.0/8',
    '0.0.0.0/0',
    '::/0',
    '*',
    '*.*',
    'http://*',
    'https://*'
  ])
  const entries = bypassEntries(value)
  return entries.length
    ? entries
        .map((entry) => (standard.has(entry) ? entry : tr('Custom entry (redacted)')))
        .join('; ')
    : tr('Not configured')
}

export function safeDiagnosticCode(code?: string): string | undefined {
  const allowed = [
    'timeout',
    'connection-refused',
    'proxy-authentication',
    'tunnel-rejected',
    'tls-failed',
    'unexpected-response',
    'network-error',
    'invalid-port',
    'runtime-port-unavailable',
    'service-unavailable',
    'service-diagnostics-unsupported',
    'service-authentication-required',
    'service-permission-denied',
    'service-timeout',
    'service-response-invalid',
    'service-request-failed',
    'core-config-unavailable',
    'core-config-failed',
    'core-start-failed',
    'core-restart-failed',
    'core-exited'
  ]
  return code ? (allowed.includes(code) ? code : 'network-error') : undefined
}

export function buildSystemProxyDiagnostics(
  input: SystemProxyDiagnosticInput
): SystemProxyDiagnostics {
  const { windowsProxy: current, expectedProxy, mode } = input
  const isWindows = input.platform === 'win32'
  const pacMatches =
    mode === 'auto' && !!input.expectedPacUrl && current?.pacUrl === input.expectedPacUrl
  const unexpectedPac = !!current?.pacUrl && !pacMatches
  const addressMatches = !!current && proxyAddressMatches(current.server, expectedProxy)
  const bypassMatches =
    !!current &&
    bypassEntries(current.override).join(';') ===
      bypassEntries(input.expectedBypass.join(';')).join(';')
  const enabled = current
    ? mode === 'auto'
      ? pacMatches || current.enabled
      : current.enabled
    : null
  const endpointKnown = input.expectedPort !== null
  const configMatches =
    current && (mode === 'auto' || endpointKnown)
      ? mode === 'auto'
        ? pacMatches && !current.enabled
        : current.enabled && addressMatches && !unexpectedPac && bypassMatches
      : null
  const changed =
    !!current &&
    (input.intentEnabled
      ? !enabled || configMatches === false
      : current.enabled || !!current.pacUrl)
  const broadBypass =
    !!current &&
    bypassEntries(current.override).some((entry) =>
      ['*', '*.*', 'http://*', 'https://*'].includes(entry)
    )
  const results: DiagnosticResult[] = []
  const add = (
    id: string,
    title: string,
    status: DiagnosticStatus,
    summary: string,
    details?: string,
    action?: DiagnosticAction
  ): void => {
    results.push({
      id,
      title: tr(title),
      status,
      summary: tr(summary),
      details,
      action,
      actionHint:
        input.coreRemediationUsesService && (action === 'start-core' || action === 'restart-core')
          ? tr('This action switches the core to Service management.')
          : undefined
    })
  }
  const comparison = tr('Expected: {0}\nCurrent: {1}', [
    expectedProxy ? safeProxyAddress(expectedProxy) : tr('Unknown'),
    current ? safeProxyAddress(current.server) : tr('Unknown')
  ])

  if (current) {
    add(
      'system-proxy',
      'System Proxy',
      enabled ? 'success' : 'warning',
      enabled ? 'System proxy enabled' : 'System proxy disabled',
      tr('Configuration intent: {0}; ProxyEnable: {1}', [
        input.intentEnabled ? tr('Enabled') : tr('Disabled'),
        current.enabled ? '1' : '0'
      ]),
      !enabled ? 'enable-system-proxy' : undefined
    )
    add(
      'proxy-address',
      'Proxy address',
      mode === 'auto' || !endpointKnown ? 'info' : addressMatches ? 'success' : 'error',
      mode === 'auto'
        ? 'PAC mode selects the proxy for each request'
        : !endpointKnown
          ? 'Core configuration failed or is unavailable'
          : addressMatches
            ? 'Proxy address matches KokoroBox'
            : 'Proxy address does not match KokoroBox',
      comparison,
      mode === 'manual' && endpointKnown && !addressMatches ? 'restore-system-proxy' : undefined
    )
    add(
      'pac',
      'PAC configuration',
      unexpectedPac ? 'warning' : mode === 'auto' && !pacMatches ? 'error' : 'success',
      unexpectedPac
        ? 'A PAC configuration is also active'
        : pacMatches
          ? 'KokoroBox PAC configuration active'
          : mode === 'auto'
            ? 'KokoroBox PAC configuration unavailable'
            : 'Not configured',
      tr('Detected PAC: {0}', [safePacUrl(current.pacUrl)]) +
        (unexpectedPac
          ? '\n' +
            tr(
              'PAC scripts can route requests differently from the fixed proxy. Review the configuration before restoring KokoroBox settings.'
            )
          : ''),
      unexpectedPac || (mode === 'auto' && !pacMatches) ? 'restore-system-proxy' : undefined
    )
  } else {
    add(
      'system-proxy',
      'System Proxy',
      isWindows ? 'error' : 'info',
      isWindows
        ? 'Unable to read Windows user proxy configuration'
        : 'Windows configuration checks are unavailable on this platform'
    )
    add(
      'proxy-address',
      'Proxy address',
      'info',
      'Expected proxy endpoint',
      expectedProxy ? safeProxyAddress(expectedProxy) : tr('Unknown')
    )
  }

  if (input.runtimeUnavailable) {
    const code =
      safeDiagnosticCode(input.runtimeErrorCode ?? input.connectivity.reason) ??
      'service-unavailable'
    const summaries: Record<string, string> = {
      'service-diagnostics-unsupported': tr(
        'The running Service does not support proxy diagnostics'
      ),
      'service-authentication-required': tr('Service authentication is required'),
      'service-permission-denied': tr('Service access was denied'),
      'service-timeout': tr('Service diagnostics timed out'),
      'service-response-invalid': tr('Service returned invalid diagnostic data'),
      'service-request-failed': tr('Service diagnostics request failed'),
      'service-unavailable': tr('Unable to contact KokoroBox Service')
    }
    const guidance =
      code === 'service-diagnostics-unsupported'
        ? tr(
            'Update KokoroBox Service if needed, then restart Service from Core runtime settings and run diagnostics again. The bundled Service and the running Service may be different versions.'
          )
        : ['service-authentication-required', 'service-permission-denied'].includes(code)
          ? tr(
              'Initialize or repair Service authentication in Core runtime settings, then run diagnostics again.'
            )
          : tr(
              'Check Service status in Core runtime settings and run diagnostics again. Core, listener and connectivity results remain unknown until runtime diagnostics are available.'
            )
    add(
      'runtime-diagnostics',
      'Runtime diagnostics',
      'warning',
      summaries[code] ?? summaries['service-unavailable'],
      `${guidance}\n${code}`
    )
  }
  add(
    'listener',
    'Local listener',
    input.runtimeUnavailable ? 'info' : input.listenerAvailable ? 'success' : 'error',
    input.runtimeUnavailable
      ? 'Not checked'
      : input.listenerAvailable
        ? 'Local proxy listener available'
        : 'Local proxy port is not listening',
    expectedProxy ? safeProxyAddress(expectedProxy) : tr('Unknown'),
    !input.listenerAvailable && input.coreRunning === true ? 'restart-core' : undefined
  )
  add(
    'core',
    'Core',
    input.runtimeUnavailable || input.coreRunning === null
      ? 'info'
      : input.coreRunning === true
        ? 'success'
        : 'error',
    input.coreRunning === true
      ? 'Core running'
      : input.coreRunning === false
        ? 'Core not running'
        : 'Unable to verify core runtime state',
    undefined,
    input.coreRunning === false ? 'start-core' : undefined
  )
  const portMatches = input.runtimePort === input.expectedPort
  add(
    'core-config',
    'Core configuration',
    input.runtimeUnavailable
      ? 'info'
      : input.runtimePort === undefined || !portMatches
        ? 'error'
        : 'success',
    input.runtimeUnavailable
      ? 'Not checked'
      : input.runtimePort === undefined
        ? 'Core configuration failed or is unavailable'
        : portMatches
          ? 'Runtime configuration loaded'
          : 'System proxy port does not match the current core port',
    input.runtimeUnavailable
      ? tr('Runtime diagnostics are unavailable. Core configuration has not been checked.')
      : input.runtimePort === undefined
        ? tr(
            'The running core did not return its loaded configuration. Inspect core logs for startup or configuration errors.'
          ) + (input.runtimeErrorCode ? `\n${safeDiagnosticCode(input.runtimeErrorCode)}` : '')
        : tr('Expected port: {0}; current core port: {1}', [input.expectedPort, input.runtimePort]),
    input.coreRunning === true && !portMatches ? 'restart-core' : undefined
  )
  add(
    'connectivity',
    'Proxy connectivity',
    input.runtimeUnavailable
      ? 'info'
      : input.connectivity.outcome === 'success'
        ? 'success'
        : 'error',
    input.runtimeUnavailable
      ? 'Not checked'
      : input.connectivity.outcome === 'success'
        ? 'Proxy connectivity successful'
        : input.connectivity.outcome === 'unreachable'
          ? 'Unable to connect to local proxy'
          : 'Local proxy reachable, but outbound connection failed',
    input.runtimeUnavailable
      ? tr('No runtime diagnostic result was received. Proxy connectivity has not been verified.')
      : tr('HTTPS request through the proxy to the connectivity endpoint. Result: {0}', [
          safeDiagnosticCode(input.connectivity.reason) || 'OK'
        ])
  )

  if (current) {
    add(
      'conflicts',
      'Proxy conflicts',
      changed ? 'warning' : mode === 'manual' && !endpointKnown ? 'info' : 'success',
      changed
        ? 'System proxy configuration was changed'
        : mode === 'manual' && !endpointKnown
          ? 'Unable to verify system proxy configuration'
          : 'No configuration conflict detected',
      changed
        ? comparison +
            '\n' +
            tr(
              'The current settings differ from KokoroBox. The application that changed them cannot be determined.'
            )
        : undefined,
      changed ? 'restore-system-proxy' : undefined
    )
    add(
      'bypass',
      'Proxy bypass',
      broadBypass || (mode === 'manual' && !bypassMatches) ? 'warning' : 'success',
      broadBypass
        ? 'Broad bypass rules may bypass most or all proxy traffic'
        : mode === 'manual' && !bypassMatches
          ? 'Proxy bypass differs from KokoroBox settings'
          : 'Normal',
      safeProxyBypass(current.override),
      mode === 'manual' && !bypassMatches ? 'restore-system-proxy' : undefined
    )
  }
  if (isWindows) {
    add(
      'appcontainer',
      'AppContainer loopback',
      input.appContainerErrorCode ? 'warning' : 'info',
      'Some Microsoft Store / UWP applications may require loopback access to use 127.0.0.1 proxies.',
      input.loopbackExemptions === undefined
        ? tr('Loopback exemptions could not be inspected. No permissions were changed.')
        : tr(
            '{0} apps with loopback exemptions detected. A working Win32 proxy does not guarantee access for every AppContainer app. No permissions were changed.',
            [input.loopbackExemptions]
          )
    )
    const winHttpSummary =
      input.winHttp?.mode === 'direct'
        ? tr('Direct')
        : input.winHttp?.mode === 'proxy'
          ? safeProxyAddress(input.winHttp.server || '')
          : input.winHttp?.mode === 'advanced'
            ? tr('Advanced configuration (values redacted)')
            : tr('Unknown')
    add(
      'winhttp',
      'WinHTTP',
      input.winHttpErrorCode ? 'warning' : 'info',
      'WinHTTP uses separate proxy configuration',
      (input.winHttpErrorCode ? tr('Unable to retrieve status') : winHttpSummary) +
        '\n' +
        tr(
          'WinHTTP is separate from the Windows user proxy used by many desktop apps. It is not synchronized automatically.'
        )
    )
  }
  add(
    'applications',
    'Application proxy support',
    'info',
    'Some applications ignore the system proxy or use their own proxy settings.',
    tr(
      'This test verifies the local proxy path. Check the affected application settings if its network access still fails.'
    )
  )

  let overall: SystemProxyDiagnostics['overall']
  if (isWindows && !current)
    overall = {
      status: 'error',
      summary: tr('Unable to verify system proxy configuration'),
      kind: 'configuration-unavailable'
    }
  else if (enabled === false)
    overall = { status: 'warning', summary: tr('System proxy is disabled'), kind: 'disabled' }
  else if (
    changed &&
    ((mode === 'manual' && endpointKnown && !addressMatches) || (mode === 'auto' && !pacMatches))
  )
    overall = {
      status: 'error',
      summary: tr('System proxy configuration does not match KokoroBox'),
      kind: 'configuration-mismatch'
    }
  else if (input.runtimeUnavailable)
    overall = {
      status: 'warning',
      summary: tr('Proxy runtime diagnostics are unavailable'),
      kind: 'runtime-unavailable'
    }
  else if (input.coreRunning !== true || !portMatches)
    overall = {
      status: 'error',
      summary: tr('Core runtime requires attention'),
      kind: 'core-unavailable'
    }
  else if (!input.listenerAvailable)
    overall = {
      status: 'error',
      kind: 'listener-unavailable',
      summary: tr(
        enabled
          ? 'System proxy is enabled, but the local proxy is unavailable'
          : 'The local proxy is unavailable'
      )
    }
  else if (input.connectivity.outcome !== 'success')
    overall = {
      status: 'error',
      kind: 'connectivity-failed',
      summary: tr(
        input.connectivity.outcome === 'unreachable'
          ? 'Unable to connect to local proxy'
          : 'Proxy is reachable, but outbound connectivity failed'
      )
    }
  else if (unexpectedPac || broadBypass || changed)
    overall = {
      status: 'warning',
      summary: tr('Proxy connectivity works, but system configuration requires attention'),
      kind: 'warning'
    }
  else if (!isWindows)
    overall = {
      status: 'info',
      kind: 'warning',
      summary: tr('Proxy connectivity works; Windows system configuration was not checked')
    }
  else
    overall = {
      status: 'success',
      summary: tr('System proxy is working normally'),
      kind: 'healthy'
    }

  if (!overall.kind) overall.kind = overall.status === 'info' ? 'warning' : 'connectivity-failed'

  const checkedAt = new Date().toISOString()
  return {
    checkedAt,
    overall,
    state: {
      intentEnabled: input.intentEnabled,
      enabled,
      matchesExpectedConfig: configMatches,
      listenerAvailable: input.runtimeUnavailable ? null : input.listenerAvailable,
      coreRunning: input.coreRunning,
      connectivityAvailable: input.runtimeUnavailable
        ? null
        : input.connectivity.outcome === 'success'
    },
    results,
    report: [
      'KokoroBox System Proxy Diagnostics',
      checkedAt,
      overall.summary,
      ...results.map(
        (result) =>
          `${result.title}: [${result.status}] ${result.summary}${result.details ? `\n${result.details}` : ''}`
      )
    ].join('\n\n')
  }
}
