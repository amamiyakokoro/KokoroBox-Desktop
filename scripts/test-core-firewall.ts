import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resetCoreFirewall } from '../src/main/service/core-firewall'

test('service mode delegates firewall repair without touching original executable rules', async () => {
  const calls: string[] = []
  await resetCoreFirewall({
    platform: 'win32',
    serviceMode: true,
    repairService: async () => {
      calls.push('service')
    },
    repairDirect: () => {
      calls.push('direct')
    }
  })
  assert.deepEqual(calls, ['service'])
})

test('direct mode retains existing firewall reset behavior', async () => {
  const calls: string[] = []
  await resetCoreFirewall({
    platform: 'win32',
    serviceMode: false,
    repairService: async () => {
      calls.push('service')
    },
    repairDirect: () => {
      calls.push('direct')
    }
  })
  assert.deepEqual(calls, ['direct'])
})

test('failed service repair propagates and never falls back to unrelated source-path rules', async () => {
  const failure = new Error('Service update required')
  await assert.rejects(
    resetCoreFirewall({
      platform: 'win32',
      serviceMode: true,
      repairService: async () => {
        throw failure
      },
      repairDirect: () => {
        assert.fail('wrong-path fallback would falsely report success')
      }
    }),
    (error) => error === failure
  )
})

test('non-Windows platforms do not modify firewall policy', async () => {
  for (const platform of ['darwin', 'linux'] as const) {
    await resetCoreFirewall({
      platform,
      serviceMode: true,
      repairService: async () => {
        assert.fail('unexpected service repair')
      },
      repairDirect: () => {
        assert.fail('unexpected direct repair')
      }
    })
  }
})
