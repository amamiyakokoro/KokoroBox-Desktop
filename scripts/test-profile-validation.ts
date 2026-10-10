import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  validateCoreValidationResult,
  assertCoreProfileValid,
  validateCoreProfileWithProviders,
  type CoreValidationOptions
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

const options: CoreValidationOptions = {
  executable: '/tmp/mihomo',
  configPath: '/tmp/config',
  workDir: '/tmp',
  safePaths: []
}
test('Service sandbox can validate a config outside its working directory', async () => {
  const original = {
    executable: '/opt/kokorobox/resources/sidecar/mihomo',
    configPath: '/home/user/.config/KokoroBox/work/config.yaml',
    workDir: '/home/user/.config/KokoroBox/test',
    safePaths: ['/home/user/rules']
  }
  await validateCoreProfileWithProviders(original, true, {
    serviceAvailable: async () => true,
    service: async (request) => {
      assert.deepEqual(request, {
        ...original,
        safePaths: ['/home/user/rules', original.configPath]
      })
      // Model the sandbox's missing-file failure unless the file is mounted.
      return request.safePaths.includes(request.configPath)
        ? { outcome: 'valid', output: '' }
        : { outcome: 'invalid', output: 'Initial configuration directory error' }
    },
    legacy: async () => {
      throw new Error('unexpected legacy validation')
    }
  })
  assert.deepEqual(original.safePaths, ['/home/user/rules'])
})

test('Service validation does not duplicate an already trusted config path', async () => {
  const trusted = { ...options, safePaths: [options.configPath] }
  await validateCoreProfileWithProviders(trusted, true, {
    serviceAvailable: async () => true,
    service: async (request) => {
      assert.deepEqual(request.safePaths, [options.configPath])
      return { outcome: 'valid', output: '' }
    },
    legacy: async () => {
      throw new Error('unexpected legacy validation')
    }
  })
})

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
    native: async (request: typeof options) => {
      assert.equal(request, options)
      assert.deepEqual(request.safePaths, [])
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
    legacy: async (request) => {
      assert.equal(request, options)
      assert.deepEqual(request.safePaths, [])
      calls++
      return { outcome: 'valid', output: '' }
    }
  })
  assert.equal(calls, 1)
})
