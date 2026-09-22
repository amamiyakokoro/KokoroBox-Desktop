import assert from 'node:assert/strict'
import { test } from 'node:test'
import { supportedServiceApiVersion, validateServiceMeta } from '../src/main/service/contract'

test('older Service metadata treats missing capabilities as unsupported', () => {
  const meta = validateServiceMeta({
    serviceVersion: '0.4.0',
    apiVersion: supportedServiceApiVersion,
    capabilities: { coreDesiredState: true }
  })

  assert.deepEqual(meta.capabilities, {
    coreDesiredState: true,
    sysproxyLease: false,
    sysproxyEvents: false,
    dnsLease: false,
    processRouter: false
  })
})

test('new Service capabilities do not break an older Desktop', () => {
  const meta = validateServiceMeta({
    serviceVersion: '0.6.0',
    apiVersion: supportedServiceApiVersion,
    capabilities: { dnsLease: true, futureFeature: true }
  })
  assert.equal(meta.capabilities.dnsLease, true)
  assert.equal('futureFeature' in meta.capabilities, false)
})

test('malformed known capabilities and metadata are rejected', () => {
  const base = { serviceVersion: '0.5.0', apiVersion: supportedServiceApiVersion }
  assert.throws(() => validateServiceMeta({ ...base, capabilities: { dnsLease: 'yes' } }))
  assert.throws(() => validateServiceMeta({ ...base, capabilities: [] }))
  assert.throws(() => validateServiceMeta({ ...base, capabilities: null }))
  assert.throws(() => validateServiceMeta({ ...base, capabilities: {}, serviceVersion: '' }))
})

test('unsupported future and invalid API versions are rejected explicitly', () => {
  const base = { serviceVersion: '0.5.0', capabilities: {} }
  assert.throws(
    () => validateServiceMeta({ ...base, apiVersion: supportedServiceApiVersion + 1 }),
    /Unsupported Service API version/
  )
  assert.throws(() => validateServiceMeta({ ...base, apiVersion: 0 }), /Unsupported/)
  assert.throws(() => validateServiceMeta({ ...base, apiVersion: 1.5 }), /Invalid/)
})
