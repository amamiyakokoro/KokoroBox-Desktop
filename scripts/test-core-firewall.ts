import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeFirewallRepairError, resetCoreFirewall } from '../src/main/service/core-firewall'

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
    (error) =>
      error instanceof Error && error.cause === failure && error.message.includes(failure.message)
  )
})

test('firewall errors explain recovery while retaining original technical details', () => {
  const cases: [unknown, boolean, RegExp][] = [
    [
      Object.assign(new Error('Request failed with status code 404'), { status: 404 }),
      true,
      /Update KokoroBox Service/
    ],
    [
      Object.assign(new Error('Unauthorized'), { status: 401 }),
      true,
      /Service authentication failed/
    ],
    [new Error('connect ENOENT pipe'), true, /Cannot connect to KokoroBox Service/],
    [
      new Error('start the service-managed core before repairing its firewall'),
      true,
      /core is not running/
    ],
    [new Error('timeout of 20000ms exceeded'), true, /result is unconfirmed/],
    [
      new Error('Windows Firewall policy prevents local inbound exceptions'),
      true,
      /Contact your system administrator/
    ],
    [new Error('Add(mihomo) failed: 0x80070005'), false, /Run KokoroBox as administrator/],
    [new Error('Access is denied'), true, /Check system security policies/],
    [new Error('CoInitializeEx failed: 0x80010106'), false, /See the technical details/]
  ]
  for (const [error, serviceMode, expected] of cases) {
    const message = describeFirewallRepairError(error, serviceMode)
    assert.match(message, expected)
    assert.ok(message.includes((error as Error).message))
  }
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
