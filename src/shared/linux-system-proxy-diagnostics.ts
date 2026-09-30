import { tr } from './i18n'
import type { NativeSystemProxyDiagnostics, ProxyEndpoint } from './proxy-diagnostics-contract'
import {
  buildSystemProxyDiagnostics,
  safePacUrl,
  safeProxyAddress,
  safeProxyBypass,
  type DiagnosticResult,
  type DiagnosticStatus,
  type SystemProxyDiagnosticInput,
  type SystemProxyDiagnostics
} from './system-proxy-diagnostics'

function address(endpoint?: ProxyEndpoint | null): string {
  if (!endpoint) return ''
  return `${endpoint.host.includes(':') ? `[${endpoint.host}]` : endpoint.host}:${endpoint.port}`
}
function matches(endpoint: ProxyEndpoint | null | undefined, expected: string): boolean {
  return !!endpoint && address(endpoint).toLowerCase() === expected.toLowerCase()
}
function normalized(entries: string[]): string {
  return entries
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(';')
}
function broad(entries: string[], kde = false): boolean {
  return entries.some((v) =>
    (kde ? ['0.0.0.0/0', '::/0'] : ['*', '*.*', '0.0.0.0/0', '::/0']).includes(v.trim())
  )
}

// Linux has several independent consumers of proxy settings. None represents all
// applications. Native has already inspected/parsed them; only compare and present.
export function buildLinuxSystemProxyDiagnostics(
  input: SystemProxyDiagnosticInput,
  native?: NativeSystemProxyDiagnostics
): SystemProxyDiagnostics {
  const base = buildSystemProxyDiagnostics({ ...input, windowsProxy: undefined })
  const linux = native?.linux
  const supported = !!linux && ['gnome', 'kde'].includes(linux.backend)
  const available = native?.status === 'available' && supported
  const enabled = available && typeof native.enabled === 'boolean' ? native.enabled : null
  const endpointKnown = !!input.expectedPort
  const manual = linux?.mode === 'manual'
  const pacMatches =
    available &&
    linux?.mode === 'auto' &&
    input.mode === 'auto' &&
    !!input.expectedPacUrl &&
    native.pac?.url === input.expectedPacUrl
  const bypassMatches = !!native && normalized(native.bypass) === normalized(input.expectedBypass)
  const addressesMatch =
    !!native &&
    matches(native.proxies.http, input.expectedProxy) &&
    matches(native.proxies.https, input.expectedProxy)
  const configMatches =
    !available || (input.mode === 'manual' && !endpointKnown)
      ? null
      : input.mode === 'auto'
        ? pacMatches
        : enabled === true &&
          manual &&
          addressesMatch &&
          !native.pac?.enabled &&
          bypassMatches &&
          !linux?.reversedBypass
  const changed =
    available &&
    (input.intentEnabled ? enabled === false || configMatches === false : enabled === true)
  const unexpectedPac = available && !!native.pac?.enabled && !pacMatches
  const suspiciousBypass =
    !!native && (broad(native.bypass, linux?.backend === 'kde') || !!linux?.reversedBypass)
  const rows: DiagnosticResult[] = []
  const add = (
    id: string,
    title: string,
    status: DiagnosticStatus,
    summary: string,
    details?: string
  ): void => {
    rows.push({ id, title: tr(title), status, summary: tr(summary), details })
  }
  const comparison = (endpoint?: ProxyEndpoint | null): string =>
    tr('Expected: {0}\nCurrent: {1}', [
      input.expectedProxy ? safeProxyAddress(input.expectedProxy) : tr('Unknown'),
      safeProxyAddress(address(endpoint))
    ])
  add('desktop', 'Desktop Environment', 'info', linux?.desktopEnvironment || 'Unknown')
  add(
    'proxy-backend',
    'Proxy Backend',
    available ? 'success' : supported ? 'warning' : 'info',
    supported
      ? linux?.backend === 'gnome'
        ? 'GNOME GSettings'
        : 'KDE / KIO'
      : linux?.backend === 'environment'
        ? 'Environment variables (process scope)'
        : 'No supported desktop proxy backend detected',
    (!available && supported ? tr('Unable to retrieve desktop proxy settings') + '\n' : '') +
      tr('Linux desktop proxy settings do not apply to every application.')
  )
  if (available) {
    const modes = {
      none: tr('Disabled'),
      manual: tr('Manual'),
      auto: 'PAC',
      wpad: 'WPAD',
      environment: tr('Environment Proxy')
    }
    add(
      'system-proxy',
      'Proxy mode',
      enabled ? 'success' : 'warning',
      modes[linux?.mode ?? 'none'],
      tr('Configuration intent: {0}; actual desktop proxy: {1}', [
        input.intentEnabled ? tr('Enabled') : tr('Disabled'),
        enabled ? tr('Enabled') : tr('Disabled')
      ])
    )
    for (const [id, title, endpoint] of [
      ['http-proxy', 'HTTP Proxy', native.proxies.http],
      ['https-proxy', 'HTTPS Proxy', native.proxies.https]
    ] as const) {
      add(
        id,
        title,
        !manual || !endpointKnown
          ? 'info'
          : matches(endpoint, input.expectedProxy)
            ? 'success'
            : 'error',
        safeProxyAddress(address(endpoint)),
        comparison(endpoint)
      )
    }
    if (native.proxies.socks)
      add('socks-proxy', 'SOCKS Proxy', 'info', safeProxyAddress(address(native.proxies.socks)))
    add(
      'pac',
      'PAC configuration',
      unexpectedPac ? 'warning' : 'info',
      native.pac?.enabled
        ? linux?.mode === 'wpad'
          ? 'Automatic proxy discovery (WPAD)'
          : pacMatches
            ? 'KokoroBox PAC configuration active'
            : 'A PAC configuration is also active'
        : 'Not configured',
      native.pac?.enabled ? safePacUrl(native.pac.url ?? '') : undefined
    )
    add(
      'bypass',
      'Proxy bypass',
      suspiciousBypass || (manual && !bypassMatches) ? 'warning' : 'success',
      linux?.reversedBypass
        ? 'Proxy is used only for addresses in the exceptions list'
        : suspiciousBypass
          ? 'Broad bypass rules may bypass most or all proxy traffic'
          : manual && !bypassMatches
            ? 'Proxy bypass differs from KokoroBox settings'
            : 'Normal',
      safeProxyBypass(native.bypass.join(';'))
    )
    add(
      'conflicts',
      'Proxy conflicts',
      changed ? 'warning' : configMatches === null ? 'info' : 'success',
      changed
        ? 'System proxy configuration was changed'
        : configMatches === null
          ? 'Unable to verify system proxy configuration'
          : 'No configuration conflict detected',
      changed
        ? tr(
            'Review the proxy configuration in your desktop network settings. No settings were changed.'
          )
        : undefined
    )
  } else {
    add(
      'system-proxy',
      'System Proxy',
      supported || !native ? 'warning' : 'info',
      supported || !native
        ? 'Unable to retrieve desktop proxy settings'
        : 'No supported desktop proxy backend detected'
    )
  }

  const environment = linux?.environment ?? []
  const proxyVars = environment.filter((v) => !v.name.toLowerCase().includes('no_proxy'))
  const allowedNames = new Set([
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'no_proxy',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY'
  ])
  const distinct = new Set(proxyVars.map((v) => address(v.endpoint)).filter(Boolean))
  const environmentConflict =
    proxyVars.some(
      (v) => !v.valid || (endpointKnown && !matches(v.endpoint, input.expectedProxy))
    ) ||
    distinct.size > 1 ||
    environment.some((v) => broad(v.bypass))
  add(
    'environment',
    'Environment Proxy',
    environmentConflict ? 'warning' : 'info',
    !linux
      ? 'Unable to retrieve status'
      : environmentConflict
        ? 'Environment proxy conflicts with KokoroBox'
        : environment.length
          ? 'Environment proxy variables detected'
          : 'Not configured',
    (environment
      .filter((v) => allowedNames.has(v.name))
      .map(
        (v) =>
          `${v.name}: ${
            v.name.toLowerCase() === 'no_proxy'
              ? safeProxyBypass(v.bypass.join(';'))
              : v.valid
                ? safeProxyAddress(address(v.endpoint))
                : tr('Configured (address redacted)')
          }`
      )
      .join('\n') || '') +
      '\n' +
      tr(
        'Only the environment inherited by KokoroBox is inspected. Other processes may have different variables; these are not desktop-wide settings.'
      )
  )

  const portal = linux?.portal
  const portalKnown = portal?.status === 'available'
  const portalConflict =
    portalKnown &&
    enabled === true &&
    input.mode === 'manual' &&
    endpointKnown &&
    (portal.direct ||
      !portal.proxies.length ||
      portal.proxies.some((p) => !matches(p, input.expectedProxy)))
  add(
    'portal',
    'XDG Portal Proxy',
    portalConflict
      ? 'warning'
      : portalKnown && enabled && manual && endpointKnown
        ? 'success'
        : 'info',
    !portalKnown
      ? 'Unable to retrieve status'
      : portalConflict
        ? 'Sandboxed applications may see a different proxy configuration'
        : portal.direct && !portal.proxies.length
          ? 'Direct'
          : 'Portal proxy resolution available',
    (portalKnown
      ? [
          ...portal.proxies.map((p) => safeProxyAddress(address(p))),
          ...(portal.direct ? ['direct://'] : [])
        ].join('\n') + '\n'
      : '') +
      tr(
        'ProxyResolver was queried for the HTTPS connectivity endpoint. This is configuration information, not a connectivity test or a guarantee for every sandboxed application.'
      )
  )
  // Runtime rows/actions come from the same evaluator used by Windows.
  rows.push(...base.results.filter((row) => !['system-proxy', 'proxy-address'].includes(row.id)))

  let overall = base.overall
  if (enabled === false)
    overall = { kind: 'disabled', status: 'warning', summary: tr('System proxy is disabled') }
  else if (changed && configMatches === false)
    overall = {
      kind: 'configuration-mismatch',
      status: 'error',
      summary: tr('System proxy configuration does not match KokoroBox')
    }
  else if (
    ['core-unavailable', 'listener-unavailable', 'connectivity-failed'].includes(base.overall.kind)
  ) {
    overall = base.overall
  } else if (environmentConflict)
    overall = {
      kind: 'warning',
      status: 'warning',
      summary: tr('Proxy connectivity works, but system configuration requires attention')
    }
  else if (!available)
    overall = {
      kind: supported || !native ? 'configuration-unavailable' : 'warning',
      status: supported || !native ? 'warning' : 'info',
      summary: tr(
        supported || !native
          ? 'Proxy runtime works; desktop proxy settings could not be inspected'
          : 'Proxy runtime works; no supported desktop proxy backend detected'
      )
    }
  else if (
    changed ||
    unexpectedPac ||
    suspiciousBypass ||
    environmentConflict ||
    portalConflict ||
    (manual && !bypassMatches)
  )
    overall = {
      kind: 'warning',
      status: 'warning',
      summary: tr('Proxy connectivity works, but system configuration requires attention')
    }
  else if (configMatches === true)
    overall = {
      kind: 'healthy',
      status: 'success',
      summary: tr('System proxy is working normally')
    }
  else
    overall = {
      kind: 'warning',
      status: 'info',
      summary: tr('Proxy runtime works; desktop configuration uses a separate proxy resolver')
    }

  return {
    ...base,
    overall,
    results: rows,
    state: { ...base.state, enabled, matchesExpectedConfig: configMatches },
    report: [
      'KokoroBox System Proxy Diagnostics',
      base.checkedAt,
      overall.summary,
      ...rows.map(
        (row) =>
          `${row.title}: [${row.status}] ${row.summary}${row.details ? `\n${row.details}` : ''}`
      )
    ].join('\n\n')
  }
}
