import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServiceRepairState } from '../src/renderer/src/utils/service-repair-state'

test('repair is shared across page subscriptions and runs only once', async () => {
  let complete!: () => void
  let calls = 0
  const store = createServiceRepairState(() => {
    calls++
    return new Promise<void>((resolve) => {
      complete = resolve
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
  })
  await assert.rejects(store.repair(), (error) => error === failure)
  assert.deepEqual(store.getSnapshot(), { repairing: false, restartRequired: false })
  await store.repair()
  assert.deepEqual(store.getSnapshot(), { repairing: false, restartRequired: true })
})
