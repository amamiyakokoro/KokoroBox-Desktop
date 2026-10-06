import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  validateCoreValidationResult,
  assertCoreProfileValid,
  validateCoreProfileWithProviders
} from '../src/shared/core-validation'
test('validation preserves useful errors and rejects unbounded or malformed responses', () => {
  assert.throws(
    () => assertCoreProfileValid({ outcome: 'invalid', output: 'time=x level=error invalid yaml' }),
    /invalid yaml/
  )
  assert.throws(() => assertCoreProfileValid({ outcome: 'timeout', output: '' }), /timed out/)
  assert.throws(() => assertCoreProfileValid({ outcome: 'output-limit', output: '' }), /exceeded/)
  for (const result of [
    { outcome: 'success', output: '' },
    { outcome: 'valid' },
    { outcome: 'invalid', output: 'x'.repeat(512 * 1024 + 1) }
  ]) {
    assert.throws(() => validateCoreValidationResult(result))
  }
  assert.deepEqual(
    validateCoreValidationResult({ outcome: 'valid', output: '', secret: 'discard' }),
    { outcome: 'valid', output: '' }
  )
})

const options = {
  executable: '/tmp/mihomo',
  configPath: '/tmp/config',
  workDir: '/tmp',
  safePaths: []
}
test('Service validation is authoritative and cannot fall back after rejecting a profile', async () => {
  let nativeCalls = 0
  await assert.rejects(
    validateCoreProfileWithProviders(options, true, {
      serviceAvailable: async () => true,
      service: async () => ({ outcome: 'invalid', output: 'level=error rejected' }),
      native: async () => {
        nativeCalls++
        return { outcome: 'valid', output: '' }
      },
      legacy: async () => {
        throw new Error('unexpected legacy validation')
      }
    }),
    /rejected/
  )
  assert.equal(nativeCalls, 0)
})
test('older Service uses Native, and direct mode never probes Service', async () => {
  let serviceCalls = 0
  let nativeCalls = 0
  const actions = {
    serviceAvailable: async () => {
      serviceCalls++
      return false
    },
    service: async () => {
      throw new Error('unexpected Service validation')
    },
    native: async () => {
      nativeCalls++
      return { outcome: 'valid' as const, output: '' }
    },
    legacy: async () => {
      throw new Error('unexpected legacy validation')
    }
  }
  await validateCoreProfileWithProviders(options, true, actions)
  await validateCoreProfileWithProviders(options, false, actions)
  assert.equal(serviceCalls, 1)
  assert.equal(nativeCalls, 2)
})
test('older Native retains the bounded compatibility validator', async () => {
  let calls = 0
  await validateCoreProfileWithProviders(options, false, {
    serviceAvailable: async () => false,
    service: async () => {
      throw new Error('unexpected Service validation')
    },
    legacy: async () => {
      calls++
      return { outcome: 'valid', output: '' }
    }
  })
  assert.equal(calls, 1)
})
