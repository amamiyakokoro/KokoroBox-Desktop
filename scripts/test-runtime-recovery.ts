import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServiceRepairState } from '../src/renderer/src/utils/service-repair-state'
import {
  recoverServiceBeforeReinstall,
  type ServiceRecoveryOptions
} from '../src/renderer/src/utils/service-recovery'

test('repair is shared across page subscriptions and runs only once', async () => {
  let complete!: () => void
  let calls = 0
  const store = createServiceRepairState(() => {
    calls++
    return new Promise<boolean>((resolve) => {
      complete = () => resolve(true)
    })
  })
  const events: unknown[] = []
  const unsubscribe = store.subscribe(() => events.push(store.getSnapshot()))
  const first = store.repair()
  assert.equal(first, store.repair())
  await Promise.resolve()
  assert.equal(calls, 1)
  assert.equal(store.getSnapshot().repairing, true)
  unsubscribe()
  complete()
  await first
  // A newly mounted page reads the completed state without waiting for another event.
  assert.deepEqual(store.getSnapshot(), { repairing: false, restartRequired: true })
  await store.repair()
  assert.equal(calls, 1)
  assert.equal(events.length, 1)
})

test('failed repair clears pending state and can be retried', async () => {
  let attempts = 0
  const failure = new Error('installation cancelled')
  const store = createServiceRepairState(async () => {
    if (++attempts === 1) throw failure
    return true
  })
  await assert.rejects(store.repair(), (error) => error === failure)
  assert.deepEqual(store.getSnapshot(), { repairing: false, restartRequired: false })
  await store.repair()
  assert.deepEqual(store.getSnapshot(), { repairing: false, restartRequired: true })
})

test('successful initialization does not request an app restart', async () => {
  const store = createServiceRepairState(async () => false)
  await store.repair()
  assert.deepEqual(store.getSnapshot(), { repairing: false, restartRequired: false })
})

test('service recovery initializes before reinstalling and stops when authentication succeeds', async () => {
  const calls: string[] = []
  const restartRequired = await recoverServiceBeforeReinstall({
    status: async () => 'need-init',
    initialize: async () => {
      calls.push('initialize')
    },
    authenticate: async () => {
      calls.push('authenticate')
      return true
    },
    reinstall: async () => {
      calls.push('reinstall')
    }
  })
  assert.equal(restartRequired, false)
  assert.deepEqual(calls, ['initialize', 'authenticate'])
})

test('routing recovery reinitializes even when the service already reports running', async () => {
  const calls: string[] = []
  const store = createServiceRepairState<ServiceRecoveryOptions>((options) =>
    recoverServiceBeforeReinstall(
      {
        status: async () => 'running',
        initialize: async () => {
          calls.push('initialize')
        },
        authenticate: async () => {
          calls.push('authenticate')
          return true
        },
        reinstall: async () => {
          assert.fail('A recovered service must not be reinstalled')
        }
      },
      options
    )
  )

  await store.repair({ initializeRunningService: true })
  assert.deepEqual(calls, ['initialize', 'authenticate'])
  assert.deepEqual(store.getSnapshot(), { repairing: false, restartRequired: false })
})

test('routing recovery reinstalls a running service when reinitialization cannot authenticate', async () => {
  const calls: string[] = []
  const restartRequired = await recoverServiceBeforeReinstall(
    {
      status: async () => 'running',
      initialize: async () => {
        calls.push('initialize')
      },
      authenticate: async () => {
        calls.push('authenticate')
        return false
      },
      reinstall: async () => {
        calls.push('reinstall')
      }
    },
    { initializeRunningService: true }
  )
  assert.equal(restartRequired, true)
  assert.deepEqual(calls, ['initialize', 'authenticate', 'reinstall'])
})

test('regular maintenance of a running service still reinstalls its executable', async () => {
  const calls: string[] = []
  const restartRequired = await recoverServiceBeforeReinstall({
    status: async () => 'running',
    initialize: async () => assert.fail('Initialization is only requested for routing recovery'),
    authenticate: async () => assert.fail('Initialization was not requested'),
    reinstall: async () => {
      calls.push('reinstall')
    }
  })
  assert.equal(restartRequired, true)
  assert.deepEqual(calls, ['reinstall'])
})

test('service recovery reinstalls after failed initialization but respects cancellation', async () => {
  const calls: string[] = []
  const actions = {
    status: async () => 'need-init',
    initialize: async () => {
      calls.push('initialize')
      throw new Error('initialization failed')
    },
    authenticate: async () => true,
    reinstall: async () => {
      calls.push('reinstall')
    }
  }
  assert.equal(await recoverServiceBeforeReinstall(actions), true)
  assert.deepEqual(calls, ['initialize', 'reinstall'])

  calls.length = 0
  await assert.rejects(
    recoverServiceBeforeReinstall({
      ...actions,
      initialize: async () => {
        calls.push('initialize')
        throw new Error('User canceled')
      }
    }),
    /User canceled/
  )
  assert.deepEqual(calls, ['initialize'])
})
