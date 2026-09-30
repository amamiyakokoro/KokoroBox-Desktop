import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildMacOSSystemProxyDiagnostics } from '../src/shared/macos-system-proxy-diagnostics'
import type {
  MacProxyState,
  MacNetworkService,
  NativeSystemProxyDiagnostics
} from '../src/shared/proxy-diagnostics-contract'
import type { SystemProxyDiagnosticInput } from '../src/shared/system-proxy-diagnostics'
import { defaultSystemProxyBypass } from '../src/shared/system-proxy'
import { setLocale } from '../src/shared/i18n'
setLocale('en')
const port = 18423
const endpoint = { host: '127.0.0.1', port }
function input(patch: Partial<SystemProxyDiagnosticInput> = {}): SystemProxyDiagnosticInput {
  return {
    platform: 'darwin',
    intentEnabled: true,
    mode: 'manual',
    expectedProxy: `127.0.0.1:${port}`,
    expectedPort: port,
    expectedBypass: defaultSystemProxyBypass('darwin'),
    listenerAvailable: true,
    coreRunning: true,
    runtimePort: port,
    connectivity: { outcome: 'success' },
    ...patch
  }
}
function proxies(patch: Partial<MacProxyState> = {}): MacProxyState {
  return {
    http: { enabled: true, endpoint },
    https: { enabled: true, endpoint },
    socks: { enabled: false },
    pacEnabled: false,
    autoDiscovery: false,
    bypass: defaultSystemProxyBypass('darwin'),
    excludeSimpleHostnames: true,
    ...patch
  }
}
function service(id: string, name: string, primary: boolean, state = proxies()): MacNetworkService {
  return { id, name, primary, active: primary, enabled: true, status: 'available', proxies: state }
}
function native(patch: Partial<MacProxyState> = {}): NativeSystemProxyDiagnostics {
  return {
    platform: 'darwin',
    status: 'available',
    enabled: true,
    proxies: { http: endpoint, https: endpoint },
    pac: { enabled: false },
    bypass: defaultSystemProxyBypass('darwin'),
    macos: {
      effective: proxies(patch),
      activeServiceIds: ['wifi'],
      networkLocation: 'Automatic',
      services: [service('wifi', 'Wi-Fi', true, proxies(patch))]
    }
  }
}
function row(result: ReturnType<typeof buildMacOSSystemProxyDiagnostics>, id: string) {
  const value = result.results.find((row) => row.id === id)
  assert.ok(value, `Missing row ${id}`)
  return value
}
function build(patch: Partial<SystemProxyDiagnosticInput> = {}, state = native()) {
  return buildMacOSSystemProxyDiagnostics(input(patch), state)
}

test('healthy HTTP + HTTPS on the active service uses the runtime endpoint and existing UI model', () => {
  const result = build()
  assert.equal(result.overall.kind, 'healthy')
  assert.equal(result.state.matchesExpectedConfig, true)
  assert.equal(row(result, 'http-proxy').status, 'success')
  assert.equal(row(result, 'https-proxy').status, 'success')
  assert.equal(row(result, 'network-service').summary, 'Wi-Fi')
  assert.equal(row(result, 'network-location').summary, 'Automatic')
  assert.equal(row(result, 'network-extension').status, 'info')
  assert.match(result.report, /Platform: macOS/)
  assert.doesNotMatch(result.report, /Windows|WinHTTP|AppContainer|7890/)
})
test('disabled actual state and desired-on/actual-off remain separate with explicit Native remediation', () => {
  const state = native({ http: { enabled: false }, https: { enabled: false } })
  state.enabled = false
  for (const intentEnabled of [false, true]) {
    const result = build({ intentEnabled }, state)
    assert.equal(result.overall.kind, 'disabled')
    assert.equal(result.state.enabled, false)
    assert.equal(result.state.intentEnabled, intentEnabled)
    assert.equal(row(result, 'system-proxy').action, 'enable-system-proxy')
    assert.equal(row(result, 'conflicts').status, intentEnabled ? 'warning' : 'success')
  }
})
test('HTTP correct and HTTPS disabled is a configuration mismatch, independent of runtime success', () => {
  const result = build({}, native({ https: { enabled: false } }))
  assert.equal(row(result, 'http-proxy').status, 'success')
  assert.equal(row(result, 'https-proxy').status, 'error')
  assert.equal(row(result, 'https-proxy').action, 'restore-system-proxy')
  assert.equal(row(result, 'connectivity').status, 'success')
  assert.equal(result.overall.kind, 'configuration-mismatch')
})
test('wrong configured port shows expected/current values from Service and Native', () => {
  const result = build(
    {},
    native({ http: { enabled: true, endpoint: { ...endpoint, port: 19351 } } })
  )
  assert.equal(result.overall.kind, 'configuration-mismatch')
  assert.match(
    row(result, 'http-proxy').details!,
    /Expected: 127.0.0.1:18423\nCurrent: 127.0.0.1:19351/
  )
})
test('switch to Ethernet does not inherit health from inactive Wi-Fi', () => {
  const state = native({ http: { enabled: false }, https: { enabled: false } })
  state.enabled = false
  state.macos!.activeServiceIds = ['ethernet']
  state.macos!.services = [
    service('wifi', 'Wi-Fi', false),
    service('ethernet', 'Ethernet', true, state.macos!.effective!)
  ]
  const result = build({}, state)
  assert.equal(row(result, 'network-service').summary, 'Ethernet')
  assert.equal(result.overall.kind, 'configuration-mismatch')
  assert.equal(
    row(result, 'system-proxy').summary,
    'Proxy is not configured for the active network service'
  )
  assert.match(row(result, 'inactive-services').details!, /Wi-Fi: 127.0.0.1:18423/)
})
test('a global effective proxy alone cannot prove the active service has matching settings', () => {
  const state = native()
  state.macos!.services[0].proxies = proxies({
    http: { enabled: false },
    https: { enabled: false }
  })
  const result = build({}, state)
  assert.equal(result.overall.kind, 'configuration-mismatch')
  assert.equal(row(result, 'http-proxy').status, 'error')
})
test('missing primary service identification never chooses an inactive configured service', () => {
  const state = native()
  state.macos!.activeServiceIds = []
  state.macos!.services[0].primary = false
  const result = build({}, state)
  assert.equal(result.overall.kind, 'configuration-unavailable')
  assert.equal(result.state.matchesExpectedConfig, null)
  assert.equal(row(result, 'http-proxy').action, undefined)
})
test('current Network Location is context, and its mismatching configuration is independently flagged', () => {
  const state = native()
  state.macos!.networkLocation = 'Office'
  assert.equal(build({}, state).overall.kind, 'healthy')
  state.macos!.effective!.https = { enabled: false }
  state.macos!.services[0].proxies!.https = { enabled: false }
  const result = build({}, state)
  assert.equal(row(result, 'network-location').summary, 'Office')
  assert.equal(row(result, 'network-location').status, 'info')
  assert.equal(result.overall.kind, 'configuration-mismatch')
})
test('PAC and discovery remain warnings when manual configuration and actual connectivity work', () => {
  for (const patch of [
    { pacEnabled: true, pacUrl: 'https://private/PAC?token=SECRET' },
    { autoDiscovery: true }
  ]) {
    const result = build({}, native(patch))
    assert.equal(result.overall.kind, 'warning')
    assert.equal(result.state.matchesExpectedConfig, true)
    assert.equal(row(result, patch.pacEnabled ? 'pac' : 'auto-discovery').status, 'warning')
    assert.equal(row(result, 'connectivity').status, 'success')
    assert.doesNotMatch(result.report, /private|token=|SECRET/)
  }
})
test('PAC mode checks the expected local PAC URL instead of demanding manual endpoints', () => {
  const url = 'http://127.0.0.1:40231/pac'
  const state = native({
    http: { enabled: false },
    https: { enabled: false },
    pacEnabled: true,
    pacUrl: url
  })
  const result = build({ mode: 'auto', expectedPacUrl: url }, state)
  assert.equal(result.overall.kind, 'healthy')
  assert.equal(row(result, 'http-proxy').status, 'info')
  assert.equal(row(result, 'pac').status, 'success')
})

test('primary-service automatic settings remain visible and unknown service PAC is not a false mismatch', () => {
  const state = native()
  state.macos!.services[0].proxies!.pacEnabled = true
  state.macos!.services[0].proxies!.pacUrl = 'https://private/pac?token=SECRET'
  state.macos!.services[0].proxies!.autoDiscovery = true
  const result = build({}, state)
  assert.equal(result.overall.kind, 'warning')
  assert.equal(row(result, 'pac').status, 'warning')
  assert.equal(row(result, 'auto-discovery').status, 'warning')
  assert.doesNotMatch(result.report, /private|SECRET/)

  state.macos!.effective = proxies({
    http: { enabled: false },
    https: { enabled: false },
    pacEnabled: true,
    pacUrl: 'http://127.0.0.1:40321/pac'
  })
  state.macos!.activeServiceIds = []
  const unknown = build({ mode: 'auto', expectedPacUrl: 'http://127.0.0.1:40321/pac' }, state)
  assert.equal(unknown.overall.kind, 'configuration-unavailable')
  assert.equal(row(unknown, 'pac').status, 'info')
  assert.equal(row(unknown, 'pac').action, undefined)
})
test('suspicious bypass warns; normal local exclusions do not imply an error', () => {
  const broad = build({}, native({ bypass: ['*'] }))
  assert.equal(broad.overall.kind, 'warning')
  assert.match(row(broad, 'bypass').summary, /Broad bypass/)
  const normal = build({}, native({ bypass: ['<local>', 'localhost', '*.local'] }))
  assert.equal(row(normal, 'bypass').status, 'warning')
  assert.doesNotMatch(row(normal, 'bypass').summary, /Broad bypass/)
  assert.notEqual(normal.overall.status, 'error')
})
test('stopped core, unavailable listener and failed outbound retain distinct health states', () => {
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
    const result = build(patch)
    assert.equal(result.overall.kind, kind)
    assert.equal(row(result, id).status, 'error')
    assert.equal(result.state.enabled, true)
  }
})
test('optional Native location failure does not fail healthy proxy; missing effective state preserves service data', () => {
  const state = native()
  state.macos!.networkLocation = undefined
  state.macos!.locationErrorCode = 'configuration-unavailable'
  let result = build({}, state)
  assert.equal(row(result, 'network-location').status, 'warning')
  assert.equal(result.overall.kind, 'healthy')
  state.status = 'unavailable'
  state.macos!.effective = undefined
  result = build({}, state)
  assert.equal(result.overall.kind, 'configuration-unavailable')
  assert.equal(row(result, 'connectivity').status, 'success')
  assert.match(row(result, 'http-proxy').details!, /Wi-Fi: 127.0.0.1:18423/)
})
test('Service unavailable preserves OS configuration and does not invent a port or claim connectivity OK', () => {
  const result = build({
    expectedPort: null,
    expectedProxy: '',
    runtimeUnavailable: true,
    coreRunning: null,
    runtimePort: undefined,
    listenerAvailable: false,
    connectivity: { outcome: 'unreachable', reason: 'service-unavailable' }
  })
  assert.equal(row(result, 'system-proxy').status, 'success')
  assert.equal(row(result, 'network-service').summary, 'Wi-Fi')
  assert.equal(row(result, 'http-proxy').status, 'info')
  assert.equal(result.state.matchesExpectedConfig, null)
  assert.equal(row(result, 'http-proxy').action, undefined)
  assert.equal(result.overall.kind, 'runtime-unavailable')
  assert.equal(result.state.listenerAvailable, null)
  assert.equal(result.state.connectivityAvailable, null)
  for (const id of ['core', 'core-config', 'listener', 'connectivity']) {
    assert.equal(row(result, id).status, 'info')
    assert.equal(row(result, id).action, undefined)
  }
  assert.doesNotMatch(result.report, /Result: OK|7890/)
})
test('both IPv4 and IPv6 primary services are checked rather than selecting an arbitrary active interface', () => {
  const state = native()
  state.macos!.activeServiceIds.push('ethernet')
  state.macos!.services.push(
    service('ethernet', 'Ethernet', true, proxies({ https: { enabled: false } }))
  )
  const result = build({}, state)
  assert.equal(result.overall.kind, 'configuration-mismatch')
  assert.equal(row(result, 'network-service').summary, 'Wi-Fi, Ethernet')
  assert.equal(row(result, 'https-proxy').status, 'error')
})
test('reports omit credentials, private endpoints, custom bypass and unsafe network labels', () => {
  const state = native({
    http: { enabled: true, endpoint: { host: 'SECRET.internal', port } },
    bypass: ['SECRET.internal'],
    pacEnabled: true,
    pacUrl: 'https://user:SECRET@private/PAC?token=SECRET'
  })
  state.macos!.networkLocation = 'https://user:SECRET@private'
  state.macos!.services[0].name = 'user:SECRET@private'
  state.errorCode = 'https://SECRET/error'
  state.macos!.serviceErrorCode = 'SECRET'
  assert.doesNotMatch(JSON.stringify(build({}, state)), /SECRET|private|token=|user:/)
})
