import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setLocale } from '../src/shared/i18n'
import { bootstrapDNSAddresses } from '../src/main/sys/dns-bootstrap'
import { appendDNSDiagnostics, canRepairDNS } from '../src/shared/dns-diagnostics'
import {
  validateDNSResolutionDiagnostics,
  validateProxyRuntimeDiagnostics,
  type NativeSystemDNSDiagnostics
} from '../src/shared/proxy-diagnostics-contract'
import type { SystemProxyDiagnostics } from '../src/shared/system-proxy-diagnostics'

setLocale('en')
const queries = (outcome: 'success' | 'failed' | 'unavailable') =>
  ['www.gstatic.com', 'example.com'].map((domain) => ({ domain, outcome }))
const system = (patch: Partial<NativeSystemDNSDiagnostics> = {}): NativeSystemDNSDiagnostics => ({
  outcome: 'failed',
  queries: queries('failed'),
  interface: 'Wi-Fi',
  servers: ['192.168.1.1'],
  ...patch
})
const result = (
  kind: SystemProxyDiagnostics['overall']['kind'] = 'healthy'
): SystemProxyDiagnostics => ({
  checkedAt: '2026-10-01T00:00:00Z',
  overall: { kind, status: 'success', summary: 'Healthy' },
  state: {
    intentEnabled: true,
    enabled: true,
    matchesExpectedConfig: true,
    coreRunning: true,
    listenerAvailable: true,
    connectivityAvailable: true
  },
  results: [],
  report: ''
})

test('bootstrap IP extraction accepts encrypted URLs and IPv6 but never resolves a hostname', () => {
  assert.deepEqual(
    bootstrapDNSAddresses([
      'tls://223.5.5.5',
      'https://1.1.1.1/dns-query',
      'udp://[2606:4700:4700::1111]:53',
      '223.5.5.5',
      '2606:4700:4700:0:0:0:0:1111'
    ]),
    ['223.5.5.5', '1.1.1.1', '2606:4700:4700::1111']
  )
  assert.deepEqual(
    bootstrapDNSAddresses([
      'system',
      'https://dns.example.com/query?token=private',
      'https://user:secret@1.1.1.1/dns-query',
      'rcode://success',
      '127.0.0.1',
      '::1',
      '::',
      '0.0.0.0',
      '224.0.0.1',
      'FF02::1',
      '198.18.0.1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '1.1.1.1;whoami'
    ]),
    []
  )
  assert.deepEqual(bootstrapDNSAddresses(undefined), [])
})

test('DNS failures add independent rows, current DNS and explicit repair on all platforms', () => {
  for (const name of ['Wi-Fi', 'en0', 'eth0']) {
    const evidence = { system: system({ interface: name }), bootstrap: ['223.5.5.5'] }
    const next = appendDNSDiagnostics(result(), evidence)
    assert.equal(next.overall.kind, 'dns-failed')
    assert.equal(next.results.find((row) => row.id === 'system-dns')?.status, 'error')
    assert.equal(
      next.results.find((row) => row.id === 'dns-settings')?.action,
      'restore-bootstrap-dns'
    )
    assert.match(next.report, /192\.168\.1\.1/)
    assert.match(next.report, /223\.5\.5\.5/)
    assert.doesNotMatch(next.report, /bilibili|bilivideo/)
  }
})

test('core DNS failure suggests bootstrap repair even if the system resolver works', () => {
  const evidence = {
    system: system({ outcome: 'success', queries: queries('success') }),
    core: { outcome: 'failed' as const, queries: queries('failed') },
    bootstrap: ['1.1.1.1']
  }
  assert.equal(canRepairDNS(evidence), true)
  const next = appendDNSDiagnostics(result('connectivity-failed'), evidence)
  assert.equal(next.overall.kind, 'dns-failed')
  assert.match(next.report, /saves the current system DNS addresses/)
})

test('missing or encrypted bootstrap can be replaced with system DNS, while resolver stubs are excluded', () => {
  assert.equal(canRepairDNS({ system: system(), bootstrap: [] }), true)
  assert.equal(
    canRepairDNS({ system: system(), bootstrap: ['192.168.1.1'], bootstrapMatchesSystem: false }),
    true
  )
  assert.deepEqual(bootstrapDNSAddresses(['127.0.0.53', '198.18.0.1', '192.168.1.1', 'fd00::1']), [
    '192.168.1.1',
    'fd00::1'
  ])
})

test('unknown DNS is not a resolution failure and unavailable or unchanged settings offer no mutation', () => {
  assert.equal(appendDNSDiagnostics(result(), { bootstrap: [] }).overall.kind, 'healthy')
  for (const evidence of [
    { system: system({ servers: [] }), bootstrap: [] },
    { system: system(), bootstrap: ['1.1.1.1'], configurable: false },
    { system: system(), bootstrap: ['1.1.1.1'], replacement: [] },
    { system: system({ interface: undefined }), bootstrap: ['1.1.1.1'] },
    { system: system(), bootstrap: ['192.168.1.1'] },
    { system: system({ outcome: 'success' }), bootstrap: ['1.1.1.1'] }
  ]) {
    assert.equal(canRepairDNS(evidence), false)
    assert.equal(
      appendDNSDiagnostics(result(), evidence).results.find((row) => row.id === 'dns-settings')
        ?.action,
      undefined
    )
  }
  assert.equal(
    appendDNSDiagnostics(result('core-unavailable'), { system: system(), bootstrap: ['1.1.1.1'] })
      .overall.kind,
    'core-unavailable'
  )
})

test('DNS contracts reject missing, duplicated, inconsistent and arbitrary domains', () => {
  const good = { outcome: 'success', queries: queries('success'), privateConfig: 'secret' }
  assert.deepEqual(validateDNSResolutionDiagnostics(good), {
    outcome: 'success',
    queries: queries('success')
  })
  for (const value of [
    undefined,
    {},
    { ...good, outcome: 'failed' },
    { ...good, queries: [] },
    { ...good, queries: [good.queries[0], good.queries[0]] },
    { ...good, queries: [{ domain: 'private.invalid', outcome: 'success' }, good.queries[1]] }
  ]) {
    assert.throws(() => validateDNSResolutionDiagnostics(value))
  }
  const runtime = {
    core: { running: true, ready: true },
    proxy: { host: '127.0.0.1', port: 1234 },
    listener: { available: true },
    connectivity: { available: true, outcome: 'success' },
    dns: good
  }
  assert.deepEqual(validateProxyRuntimeDiagnostics(runtime).dns, {
    outcome: 'success',
    queries: queries('success')
  })
  assert.equal(validateProxyRuntimeDiagnostics({ ...runtime, dns: undefined }).dns, undefined)
  const invalidDNS = validateProxyRuntimeDiagnostics({
    ...runtime,
    dns: { outcome: 'failed', queries: [] }
  })
  assert.equal(invalidDNS.dns, undefined)
  assert.equal(invalidDNS.core.ready, true)
})
