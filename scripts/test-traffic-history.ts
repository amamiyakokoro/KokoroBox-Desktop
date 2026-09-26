import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTrafficHistoryStore } from '../src/renderer/src/utils/traffic-history-store'

test('history continues without a mounted page and persists in batches', () => {
  let now = 1000
  let writes = 0
  let saved: string | null = null
  const store = createTrafficHistoryStore(
    {
      getItem: () => saved,
      setItem: (_key, value) => {
        writes++
        saved = value
      },
      removeItem: () => {
        writes++
        saved = null
      }
    },
    () => now
  )
  const unsubscribe = store.subscribe(() => {})
  store.receive({ down: 12, up: 2 })
  unsubscribe()
  for (let i = 0; i < 14; i++) {
    now += 1000
    store.receive({ down: i, up: 0 })
  }
  assert.equal(writes, 0)
  assert.equal(store.getSnapshot().history.length, 15)
  store.flush()
  assert.equal(writes, 1)
  store.flush()
  assert.equal(writes, 1)
  now += 301_000
  store.tick()
  store.flush()
  assert.equal(saved, null)
  assert.equal(store.getSnapshot().history.length, 0)
  assert.equal(store.getSnapshot().rates, undefined)
})

test('restored history and core resets never masquerade as live rates', () => {
  let now = 2000
  const store = createTrafficHistoryStore(
    {
      getItem: () => JSON.stringify([{ index: 1000, up: 20, down: 50 }]),
      setItem: () => {},
      removeItem: () => {}
    },
    () => now
  )
  assert.equal(store.getSnapshot().rates, undefined)
  store.receive({ up: 2, down: 3 })
  const history = store.getSnapshot().history
  now += 6000
  store.tick()
  assert.equal(store.getSnapshot().rates, undefined)
  assert.equal(store.getSnapshot().history, history)
  store.receive({ up: 4, down: 5 })
  store.resetLive()
  assert.equal(store.getSnapshot().rates, undefined)
  assert.equal(store.getSnapshot().history.length, 3)
})

test('storage failure is retried without losing in-memory history', () => {
  let fail = true
  let saved = ''
  const store = createTrafficHistoryStore(
    {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: (_key, value) => {
        if (fail) throw new Error('quota')
        saved = value
      },
      removeItem: () => {}
    },
    () => 1000
  )
  store.receive({ up: 1, down: 2 })
  store.flush()
  assert.equal(store.getSnapshot().history.length, 1)
  fail = false
  store.flush()
  assert.equal(JSON.parse(saved).length, 1)
})

test('sampling is limited to one per second, bounded in size, and rejects invalid rates', () => {
  let now = 1000
  const store = createTrafficHistoryStore(
    { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    () => now
  )
  for (let i = 0; i < 800; i++) {
    store.receive({ up: i, down: i })
    now += 500
  }
  assert.equal(store.getSnapshot().history.length, 300)
  const last = store.getSnapshot()
  store.receive({ up: NaN, down: 0 })
  store.receive({ up: 0, down: -1 })
  store.receive({ up: Infinity, down: 0 })
  assert.equal(store.getSnapshot(), last)
})
