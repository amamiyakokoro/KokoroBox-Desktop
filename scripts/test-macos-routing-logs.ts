import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMacRoutingLogStore } from '../src/main/app-routing/macos-logs'

const entry = {
  time: '2026-10-06T01:00:00Z',
  level: 'INFO',
  message: 'TCP curl → host:443 [BLOCK]'
}

test('retains drained batches with stable IDs and bounds Desktop history', async () => {
  let batch = [entry]
  const store = createMacRoutingLogStore(
    async () => batch,
    async () => {}
  )
  assert.equal((await store.get())[0].id, 1)
  batch = []
  assert.equal((await store.get())[0].id, 1)
  batch = Array.from({ length: 100 }, () => entry)
  for (let i = 0; i < 6; i++) await store.get()
  batch = []
  const entries = await store.get()
  assert.equal(entries.length, 500)
  assert.equal(entries[0].id, 102)
  assert.equal(entries.at(-1)?.id, 601)
})

test('a clear waits for an in-flight read and removes both provider and Desktop history', async () => {
  let resolveRead!: (value: (typeof entry)[]) => void
  let cleared = false
  const store = createMacRoutingLogStore(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve
      }),
    async () => {
      cleared = true
    }
  )
  const pending = store.get()
  await Promise.resolve()
  const clear = store.clear()
  await Promise.resolve()
  assert.equal(cleared, false)
  resolveRead([entry])
  assert.equal((await pending).length, 1)
  await clear
  assert.equal(cleared, true)
  const next = store.get()
  await Promise.resolve()
  resolveRead([])
  assert.deepEqual(await next, [])
})

test('failed operations preserve history and do not stall the queue', async () => {
  let failRead = false
  let failClear = true
  let batch = [entry]
  const store = createMacRoutingLogStore(
    async () => {
      if (failRead) throw new Error('read failed')
      return batch
    },
    async () => {
      if (failClear) throw new Error('clear failed')
    }
  )
  await store.get()
  failRead = true
  await assert.rejects(store.get(), /read failed/)
  await assert.rejects(store.clear(), /clear failed/)
  failRead = false
  batch = []
  assert.equal((await store.get()).length, 1)
  failClear = false
  await store.clear()
  assert.deepEqual(await store.get(), [])
})
