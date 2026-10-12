import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateServicePacUrl } from '../src/shared/service-pac'
import { validateServiceMeta } from '../src/main/service/contract'
test('Service PAC serving is opt-in for older binaries', () => {
  const meta = { serviceVersion: 'dev', apiVersion: 1 }
  assert.equal(
    validateServiceMeta({ ...meta, capabilities: {} }).capabilities.sysproxyPacServer,
    false
  )
  assert.equal(
    validateServiceMeta({ ...meta, capabilities: { sysproxyPacServer: true } }).capabilities
      .sysproxyPacServer,
    true
  )
})
test('Service PAC responses must use a loopback PAC endpoint', () => {
  assert.equal(
    validateServicePacUrl({ url: 'http://127.0.0.1:1234/pac' }),
    'http://127.0.0.1:1234/pac'
  )
  for (const url of [
    'https://127.0.0.1:1234/pac',
    'http://example.com:1234/pac',
    'http://user@127.0.0.1:1234/pac',
    'http://127.0.0.1:1234/other',
    'http://127.0.0.1:1234/pac#other',
    'http://127.0.0.1/pac'
  ]) {
    assert.throws(() => validateServicePacUrl({ url }))
  }
})
