import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildLinuxSystemProxyDiagnostics } from '../src/shared/linux-system-proxy-diagnostics'
import type { NativeSystemProxyDiagnostics } from '../src/shared/proxy-diagnostics-contract'
import type { SystemProxyDiagnosticInput } from '../src/shared/system-proxy-diagnostics'
import { defaultSystemProxyBypass } from '../src/shared/system-proxy'
import { setLocale } from '../src/shared/i18n'
setLocale('en')
const port = 18423
const endpoint = { host: '127.0.0.1', port }
function input(patch: Partial<SystemProxyDiagnosticInput> = {}): SystemProxyDiagnosticInput {
  return {
    platform: 'linux',
    intentEnabled: true,
    mode: 'manual',
    expectedProxy: `127.0.0.1:${port}`,
    expectedPort: port,
    expectedBypass: defaultSystemProxyBypass('linux'),
    listenerAvailable: true,
    coreRunning: true,
    runtimePort: port,
    connectivity: { outcome: 'success' },
    ...patch
  }
}
function native(backend: 'gnome' | 'kde' = 'gnome'): NativeSystemProxyDiagnostics {
  return {
    platform: 'linux',
    status: 'available',
    enabled: true,
    proxies: { http: endpoint, https: endpoint },
    pac: { enabled: false },
    bypass: defaultSystemProxyBypass('linux'),
    linux: {
      desktopEnvironment: backend === 'gnome' ? 'GNOME' : 'KDE Plasma',
      backend,
      mode: 'manual',
      reversedBypass: false,
      environment: [],
      portal: { status: 'available', direct: false, proxies: [endpoint] }
    }
  }
}
function row(result: ReturnType<typeof buildLinuxSystemProxyDiagnostics>, id: string) {
  const value = result.results.find((row) => row.id === id)
  assert.ok(value, `Missing row ${id}`)
  return value
}

test('GNOME and KDE compare the service port with both HTTP and HTTPS without Windows rows', () => {
  for (const backend of ['gnome', 'kde'] as const) {
    const result = buildLinuxSystemProxyDiagnostics(input(), native(backend))
    assert.equal(result.overall.kind, 'healthy')
    assert.equal(result.state.enabled, true)
    assert.equal(result.state.matchesExpectedConfig, true)
    assert.equal(row(result, 'portal').status, 'success')
    assert.match(result.report, /18423/)
    assert.doesNotMatch(result.report, /Windows|WinHTTP|AppContainer|7890/)
    assert.ok(
      result.results.every(
        (row) => !row.action || ['start-core', 'restart-core'].includes(row.action)
      )
    )
  }
})
test('desired-on actual-off is disabled with a configuration-changed warning', () => {
  const state = native()
  state.enabled = false
  state.linux!.mode = 'none'
  const result = buildLinuxSystemProxyDiagnostics(input(), state)
  assert.equal(result.state.intentEnabled, true)
  assert.equal(result.state.enabled, false)
  assert.equal(result.overall.kind, 'disabled')
  assert.equal(row(result, 'conflicts').summary, 'System proxy configuration was changed')
  assert.equal(
    row(buildLinuxSystemProxyDiagnostics(input({ intentEnabled: false }), state), 'conflicts')
      .status,
    'success'
  )
})
test('wrong or absent HTTPS endpoint is a mismatch even when HTTP matches', () => {
  for (const https of [undefined, { host: '127.0.0.1', port: 19351 }]) {
    const state = native()
    state.proxies.https = https
    const result = buildLinuxSystemProxyDiagnostics(input(), state)
    assert.equal(result.overall.kind, 'configuration-mismatch')
    assert.equal(row(result, 'http-proxy').status, 'success')
    assert.equal(row(result, 'https-proxy').status, 'error')
  }
})
test('runtime failures remain independent of a matching OS configuration', () => {
  const cases: [Partial<SystemProxyDiagnosticInput>, string, string][] = [
    [
      { coreRunning: false, runtimePort: undefined, expectedPort: null, expectedProxy: '' },
      'core-unavailable',
      'core'
    ],
    [
      { listenerAvailable: false, connectivity: { outcome: 'unreachable' } },
      'listener-unavailable',
      'listener'
    ],
    [
      { connectivity: { outcome: 'outbound-failed', reason: 'timeout' } },
      'connectivity-failed',
      'connectivity'
    ]
  ]
  for (const [patch, kind, id] of cases) {
    const result = buildLinuxSystemProxyDiagnostics(input(patch), native())
    assert.equal(result.overall.kind, kind)
    assert.equal(row(result, id).status, 'error')
    assert.equal(result.state.enabled, true)
  }
})
test('PAC, WPAD and reversed KDE exceptions are visible separately', () => {
  const state = native('kde')
  state.linux!.mode = 'wpad'
  state.pac = { enabled: true }
  const result = buildLinuxSystemProxyDiagnostics(input(), state)
  assert.equal(result.overall.kind, 'configuration-mismatch')
  assert.equal(row(result, 'pac').summary, 'Automatic proxy discovery (WPAD)')
  state.linux!.mode = 'manual'
  state.pac = { enabled: false }
  state.linux!.reversedBypass = true
  assert.equal(row(buildLinuxSystemProxyDiagnostics(input(), state), 'bypass').status, 'warning')
  const gnome = native()
  gnome.linux!.mode = 'auto'
  gnome.pac = { enabled: true, url: 'http://127.0.0.1:40123/pac' }
  assert.equal(
    buildLinuxSystemProxyDiagnostics(input({ mode: 'auto', expectedPacUrl: gnome.pac.url! }), gnome)
      .overall.kind,
    'healthy'
  )
})
test('broad bypass differs from normal local exclusions, KDE wildcards are not claimed to work', () => {
  const state = native()
  state.bypass = ['*']
  assert.match(
    row(buildLinuxSystemProxyDiagnostics(input(), state), 'bypass').summary,
    /Broad bypass/
  )
  state.bypass = ['<local>']
  assert.doesNotMatch(
    row(buildLinuxSystemProxyDiagnostics(input(), state), 'bypass').summary,
    /Broad bypass/
  )
  const kde = native('kde')
  kde.bypass = ['*']
  assert.doesNotMatch(
    row(buildLinuxSystemProxyDiagnostics(input(), kde), 'bypass').summary,
    /Broad bypass/
  )
})
test('environment variables are informational when matching and warn for conflicts in either casing', () => {
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'http_proxy']) {
    const state = native()
    state.linux!.environment = [{ name, endpoint, bypass: [], valid: true }]
    assert.equal(
      row(buildLinuxSystemProxyDiagnostics(input(), state), 'environment').status,
      'info'
    )
    state.linux!.environment[0].endpoint = { host: '127.0.0.1', port: 19351 }
    const result = buildLinuxSystemProxyDiagnostics(input(), state)
    assert.equal(result.overall.kind, 'warning')
    assert.equal(row(result, 'environment').status, 'warning')
    assert.match(row(result, 'environment').details!, /19351/)
    assert.match(row(result, 'environment').details!, /inherited by KokoroBox/)
  }
})
test('portal direct, mismatched and unavailable responses do not invalidate working runtime', () => {
  const state = native()
  for (const portal of [
    { status: 'available' as const, direct: true, proxies: [] },
    { status: 'available' as const, direct: false, proxies: [{ host: '127.0.0.1', port: 19351 }] },
    { status: 'unavailable' as const, direct: false, proxies: [], errorCode: 'timeout' }
  ]) {
    state.linux!.portal = portal
    const result = buildLinuxSystemProxyDiagnostics(input(), state)
    assert.equal(row(result, 'portal').status, portal.status === 'available' ? 'warning' : 'info')
    assert.equal(result.state.connectivityAvailable, true)
    assert.equal(row(result, 'connectivity').status, 'success')
  }
})
test('unsupported desktop and environment fallback never claim a desktop-wide enabled proxy', () => {
  for (const backend of ['environment', 'unsupported'] as const) {
    const state = native()
    state.status = 'unsupported'
    state.enabled = undefined
    state.linux!.backend = backend
    state.linux!.desktopEnvironment = 'Hyprland'
    state.linux!.mode = undefined
    const result = buildLinuxSystemProxyDiagnostics(input(), state)
    assert.equal(result.state.enabled, null)
    assert.equal(result.state.matchesExpectedConfig, null)
    assert.equal(result.overall.status, 'info')
    assert.match(result.overall.summary, /no supported desktop proxy backend/)
    assert.equal(row(result, 'connectivity').status, 'success')
  }
})
test('Native and Service failures preserve the other domain and do not invent runtime ports', () => {
  const missingNative = buildLinuxSystemProxyDiagnostics(input(), undefined)
  assert.equal(row(missingNative, 'connectivity').status, 'success')
  assert.equal(missingNative.overall.kind, 'configuration-unavailable')
  const missingService = buildLinuxSystemProxyDiagnostics(
    input({
      coreRunning: null,
      runtimePort: undefined,
      expectedPort: null,
      expectedProxy: '',
      runtimeUnavailable: true,
      listenerAvailable: false,
      connectivity: { outcome: 'unreachable', reason: 'service-unavailable' }
    }),
    native()
  )
  assert.equal(row(missingService, 'system-proxy').status, 'success')
  assert.equal(missingService.state.matchesExpectedConfig, null)
  assert.equal(row(missingService, 'http-proxy').status, 'info')
  assert.doesNotMatch(missingService.report, /Result: OK|7890/)
  assert.equal(missingService.overall.kind, 'runtime-unavailable')
  assert.equal(missingService.state.listenerAvailable, null)
  assert.equal(missingService.state.connectivityAvailable, null)
  for (const id of ['core', 'core-config', 'listener', 'connectivity'])
    assert.equal(row(missingService, id).status, 'info')
})
test('Linux reports redact remote hosts, credentials, arbitrary PAC and custom bypass', () => {
  const state = native()
  state.proxies.http = { host: 'SECRET.internal', port }
  state.bypass = ['SECRET.internal']
  state.pac = { enabled: true, url: 'https://user:SECRET@private/PAC?token=SECRET' }
  state.linux!.environment = [
    { name: 'HTTPS_PROXY', endpoint: { host: 'SECRET.internal', port }, bypass: [], valid: true },
    { name: 'NO_PROXY', bypass: ['SECRET.internal'], valid: true }
  ]
  state.linux!.portal.proxies = [{ host: 'SECRET.internal', port }]
  const result = buildLinuxSystemProxyDiagnostics(input(), state)
  assert.doesNotMatch(JSON.stringify(result), /SECRET|private|token=|user:/)
})
