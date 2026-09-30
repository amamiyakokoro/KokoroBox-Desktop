import { tr } from './i18n'
import type {
  MacProxyProtocol,
  MacProxyState,
  NativeSystemProxyDiagnostics
} from './proxy-diagnostics-contract'
import {
  buildSystemProxyDiagnostics,
  safePacUrl,
  safeProxyAddress,
  safeProxyBypass,
  type DiagnosticAction,
  type DiagnosticResult,
  type DiagnosticStatus,
  type SystemProxyDiagnosticInput,
  type SystemProxyDiagnostics
} from './system-proxy-diagnostics'

function address(proxy?: MacProxyProtocol): string {
  const endpoint = proxy?.endpoint
  return endpoint
    ? `${endpoint.host.includes(':') ? `[${endpoint.host}]` : endpoint.host}:${endpoint.port}`
    : ''
}
function matches(proxy: MacProxyProtocol | undefined, expected: string): boolean {
  return (
    !!proxy?.enabled && !!proxy.endpoint && address(proxy).toLowerCase() === expected.toLowerCase()
  )
}
function label(value?: string | null): string {
  if (!value) return tr('Unknown')
  return value.length > 80 || /[\r\n\0@]|:\/\/|token[=:]/i.test(value)
    ? tr('Custom entry (redacted)')
    : value
}
function manualMatches(state: MacProxyState, expected: string): boolean {
  return matches(state.http, expected) && matches(state.https, expected)
}
function isEnabled(state?: MacProxyState | null): boolean {
  return (
    !!state &&
    (state.http.enabled ||
      state.https.enabled ||
      state.socks.enabled ||
      state.pacEnabled ||
      state.autoDiscovery)
  )
}

export function buildMacOSSystemProxyDiagnostics(
  input: SystemProxyDiagnosticInput,
  native?: NativeSystemProxyDiagnostics
): SystemProxyDiagnostics {
  const base = buildSystemProxyDiagnostics({ ...input, windowsProxy: undefined })
  const mac = native?.macos
  const effective = mac?.effective
  const available = native?.status === 'available' && !!effective
  const enabled = available ? (native.enabled ?? isEnabled(effective)) : null
  const active = mac?.services.filter((service) => mac.activeServiceIds.includes(service.id)) ?? []
  const activeKnown =
    !!mac?.activeServiceIds.length &&
    active.length === mac.activeServiceIds.length &&
    active.every(
      (service) => service.enabled && service.status === 'available' && !!service.proxies
    )
  const endpointKnown = !!input.expectedPort
  const pacKnown = !!input.expectedPacUrl
  const pacMatches =
    available &&
    effective.pacEnabled &&
    pacKnown &&
    effective.pacUrl === input.expectedPacUrl &&
    activeKnown &&
    active.every((s) => s.proxies?.pacEnabled && s.proxies.pacUrl === input.expectedPacUrl)
  const configMatches =
    !available || !activeKnown || (input.mode === 'manual' ? !endpointKnown : !pacKnown)
      ? null
      : input.mode === 'manual'
        ? manualMatches(effective, input.expectedProxy) &&
          active.every((s) => manualMatches(s.proxies!, input.expectedProxy))
        : pacMatches &&
          !effective.http.enabled &&
          !effective.https.enabled &&
          !effective.socks.enabled &&
          active.every((s) => {
            const p = s.proxies!
            return !p.http.enabled && !p.https.enabled && !p.socks.enabled
          })
  const inactiveConfigured =
    endpointKnown &&
    !!mac?.services.some(
      (s) =>
        !mac.activeServiceIds.includes(s.id) &&
        s.proxies &&
        manualMatches(s.proxies, input.expectedProxy)
    )
  const changed =
    available &&
    activeKnown &&
    (input.intentEnabled ? enabled === false || configMatches === false : enabled === true)
  const pacActive = !!effective?.pacEnabled || active.some((s) => s.proxies?.pacEnabled)
  const discoveryActive = !!effective?.autoDiscovery || active.some((s) => s.proxies?.autoDiscovery)
  const automaticWarning = (input.mode === 'manual' && pacActive) || discoveryActive
  const bypass = effective?.bypass ?? native?.bypass ?? []
  const broadBypass = bypass.some((v) => ['*', '*.*', '0.0.0.0/0', '::/0'].includes(v.trim()))
  const bypassMatches = [...bypass].sort().join(';') === [...input.expectedBypass].sort().join(';')
  const socksWarning =
    input.mode === 'manual' &&
    endpointKnown &&
    effective?.socks.enabled &&
    !matches(effective.socks, input.expectedProxy)
  const canRestore = activeKnown && endpointKnown
  const rows: DiagnosticResult[] = []
  const add = (
    id: string,
    title: string,
    status: DiagnosticStatus,
    summary: string,
    details?: string,
    action?: DiagnosticAction
  ): void => {
    rows.push({
      id,
      title: tr(title),
      status,
      summary: tr(summary),
      details,
      action,
      actionHint:
        action === 'enable-system-proxy' || action === 'restore-system-proxy'
          ? tr(
              'PAC and Auto Proxy Discovery remain unchanged when restoring manual proxies. If either is active, the watchdog and automatic lease cleanup stay paused.'
            )
          : undefined
    })
  }
  add(
    'network-service',
    'Network Service',
    activeKnown ? 'success' : 'warning',
    active.length
      ? active.map((s) => label(s.name)).join(', ')
      : 'Unable to determine the active Network Service',
    tr(
      'The current default IPv4 and IPv6 services are checked. A proxy on an inactive service does not prove the active service is configured.'
    )
  )
  add(
    'network-location',
    'Network Location',
    mac?.networkLocation ? 'info' : 'warning',
    mac?.networkLocation ? label(mac.networkLocation) : 'Unable to determine the Network Location',
    tr('Switching Network Service or Network Location can change proxy settings.')
  )
  add(
    'system-proxy',
    'System Proxy',
    !available ? 'warning' : enabled ? 'success' : 'warning',
    !available
      ? 'Unable to read macOS effective proxy configuration'
      : !enabled && inactiveConfigured && input.intentEnabled
        ? 'Proxy is not configured for the active network service'
        : enabled
          ? 'System proxy enabled'
          : 'System proxy disabled',
    tr('Configuration intent: {0}; effective system proxy: {1}', [
      input.intentEnabled ? tr('Enabled') : tr('Disabled'),
      enabled === null ? tr('Unknown') : enabled ? tr('Enabled') : tr('Disabled')
    ]),
    enabled === false && canRestore ? 'enable-system-proxy' : undefined
  )
  for (const [key, id, title] of [
    ['http', 'http-proxy', 'HTTP Proxy'],
    ['https', 'https-proxy', 'HTTPS Proxy']
  ] as const) {
    const proxy = effective?.[key]
    const ok =
      matches(proxy, input.expectedProxy) &&
      activeKnown &&
      active.every((s) => matches(s.proxies?.[key], input.expectedProxy))
    add(
      id,
      title,
      !available || input.mode === 'auto' || !endpointKnown || !activeKnown
        ? 'info'
        : ok
          ? 'success'
          : 'error',
      !available
        ? 'Unable to retrieve status'
        : proxy?.enabled
          ? safeProxyAddress(address(proxy))
          : 'Disabled',
      tr('Expected: {0}\nCurrent: {1}', [
        input.expectedProxy ? safeProxyAddress(input.expectedProxy) : tr('Unknown'),
        proxy?.enabled ? safeProxyAddress(address(proxy)) : tr('Disabled')
      ]) +
        (active.length
          ? '\n' +
            active
              .map(
                (s) =>
                  `${label(s.name)}: ${s.proxies ? (s.proxies[key].enabled ? safeProxyAddress(address(s.proxies[key])) : tr('Disabled')) : tr('Unknown')}`
              )
              .join('\n')
          : ''),
      available && input.mode === 'manual' && !ok && canRestore ? 'restore-system-proxy' : undefined
    )
  }
  if (effective?.socks.enabled)
    add(
      'socks-proxy',
      'SOCKS Proxy',
      socksWarning ? 'warning' : 'info',
      safeProxyAddress(address(effective.socks))
    )
  const inactive =
    mac?.services.filter(
      (s) => !mac.activeServiceIds.includes(s.id) && s.proxies && isEnabled(s.proxies)
    ) ?? []
  if (inactive.length)
    add(
      'inactive-services',
      'Other Network Services',
      'info',
      'Proxy settings on other services are diagnostic context only',
      inactive
        .map(
          (s) =>
            `${label(s.name)}: ${s.proxies?.http.enabled ? safeProxyAddress(address(s.proxies.http)) : tr('Disabled')}`
        )
        .join('\n')
    )
  add(
    'pac',
    'Automatic Proxy Configuration',
    !effective
      ? 'info'
      : input.mode === 'auto' && (!pacKnown || !activeKnown)
        ? 'info'
        : input.mode === 'auto' && !pacMatches
          ? 'error'
          : input.mode === 'manual' && pacActive
            ? 'warning'
            : 'success',
    !effective ? 'Unable to retrieve status' : pacActive ? 'Enabled' : 'Disabled',
    pacActive
      ? [
          ...new Set(
            [effective, ...active.map((s) => s.proxies)]
              .filter((p) => p?.pacEnabled)
              .map((p) => safePacUrl(p?.pacUrl ?? ''))
          )
        ].join('\n') +
          '\n' +
          tr(
            'A PAC configuration is active and may affect how applications select a proxy. Diagnostics do not disable it.'
          )
      : undefined,
    input.mode === 'auto' && pacKnown && activeKnown && !pacMatches && canRestore
      ? 'restore-system-proxy'
      : undefined
  )
  add(
    'auto-discovery',
    'Auto Proxy Discovery',
    !effective ? 'info' : discoveryActive ? 'warning' : 'success',
    !effective ? 'Unable to retrieve status' : discoveryActive ? 'Enabled' : 'Disabled',
    tr(
      'Automatic proxy discovery may select a different proxy. Diagnostics do not change this setting.'
    )
  )
  add(
    'bypass',
    'Proxy bypass',
    !effective ? 'info' : broadBypass || !bypassMatches ? 'warning' : 'success',
    !effective
      ? 'Unable to retrieve status'
      : broadBypass
        ? 'Broad bypass rules may bypass most or all proxy traffic'
        : !bypassMatches
          ? 'Proxy bypass differs from KokoroBox settings'
          : 'Normal',
    tr('{0} items', [bypass.length]) + '\n' + safeProxyBypass(bypass.join(';'))
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
          'Check the currently active Network Service and Network Location. The application that changed the configuration cannot be determined.'
        )
      : undefined,
    changed && canRestore ? 'restore-system-proxy' : undefined
  )
  rows.push(
    ...base.results.filter(
      (row) => !['system-proxy', 'proxy-address', 'applications'].includes(row.id)
    )
  )
  add(
    'network-extension',
    'VPN / Network Extension',
    'info',
    'Network extensions or VPN software may alter traffic routing.'
  )
  add(
    'applications',
    'Application proxy support',
    'info',
    'System proxy behavior can vary by application.',
    tr(
      'Some command-line or sandboxed applications use their own proxy configuration. Environment proxy variables are separate and were not changed.'
    )
  )

  let overall: SystemProxyDiagnostics['overall']
  if (enabled === false && input.intentEnabled && inactiveConfigured && activeKnown)
    overall = {
      kind: 'configuration-mismatch',
      status: 'error',
      summary: tr('Proxy is not configured for the active network service')
    }
  else if (enabled === false)
    overall = { kind: 'disabled', status: 'warning', summary: tr('System proxy is disabled') }
  else if (configMatches === false)
    overall = {
      kind: 'configuration-mismatch',
      status: 'error',
      summary: tr('System proxy configuration does not match KokoroBox')
    }
  else if (
    [
      'runtime-unavailable',
      'core-unavailable',
      'listener-unavailable',
      'connectivity-failed'
    ].includes(base.overall.kind)
  )
    overall = base.overall
  else if (!available || !activeKnown)
    overall = {
      kind: 'configuration-unavailable',
      status: 'warning',
      summary: tr('Unable to verify system proxy configuration')
    }
  else if (
    automaticWarning ||
    broadBypass ||
    !bypassMatches ||
    socksWarning ||
    changed ||
    configMatches === null
  )
    overall = {
      kind: 'warning',
      status: 'warning',
      summary: tr('Proxy connectivity works, but system configuration requires attention')
    }
  else
    overall = {
      kind: 'healthy',
      status: 'success',
      summary: tr('System proxy is working normally')
    }
  return {
    ...base,
    overall,
    results: rows,
    state: { ...base.state, enabled, matchesExpectedConfig: configMatches },
    report: [
      'KokoroBox System Proxy Diagnostics',
      'Platform: macOS',
      base.checkedAt,
      overall.summary,
      ...rows.map(
        (row) =>
          `${row.title}: [${row.status}] ${row.summary}${row.details ? `\n${row.details}` : ''}`
      )
    ].join('\n\n')
  }
}
