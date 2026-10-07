import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProfileUpdateScheduler } from '../src/main/core/profile-update-scheduler'

function fixture() {
  let time = 1_000_000
  let item: ProfileItem | undefined = {
    id: 'p',
    type: 'remote',
    name: 'P',
    interval: 1,
    updated: time - 60_000
  }
  let failure = true
  let refreshes = 0
  let hold: Promise<void> = Promise.resolve()
  const errors: unknown[] = []
  const timers = new Set<{ callback: () => void; delay: number }>()
  const scheduler = createProfileUpdateScheduler({
    getItem: async () => item,
    refresh: async () => {
      refreshes++
      await hold
      if (failure) throw new Error('offline')
      item = { ...item!, updated: time }
    },
    onError: (_id, error) => errors.push(error),
    now: () => time,
    setTimer: (callback, delay) => {
      const timer = { callback, delay }
      timers.add(timer)
      return () => {
        timers.delete(timer)
      }
    }
  })
  return {
    scheduler,
    timers,
    errors,
    item: () => item!,
    setItem: (next: ProfileItem | undefined) => {
      item = next
    },
    recover: () => {
      failure = false
    },
    block: (promise: Promise<void>) => {
      hold = promise
    },
    refreshes: () => refreshes,
    fire: async () => {
      const timer = [...timers][0]
      timers.delete(timer)
      time += timer.delay
      timer.callback()
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
    },
    nextDelay: () => [...timers][0]?.delay
  }
}

test('failed updates retry with capped backoff and return to normal scheduling after recovery', async () => {
  const f = fixture()
  f.scheduler.upsert(f.item())
  assert.equal(f.nextDelay(), 0)
  for (const delay of [30_000, 60_000, 120_000, 240_000, 300_000, 300_000]) {
    await f.fire()
    assert.equal(f.nextDelay(), delay)
  }
  f.recover()
  await f.fire()
  assert.equal(f.nextDelay(), 60_000)
  assert.equal(f.refreshes(), 7)
})

test('deleted or disabled subscriptions are rechecked before a scheduled refresh', async () => {
  for (const disabled of [true, false]) {
    const f = fixture()
    f.scheduler.upsert(f.item())
    f.setItem(disabled ? { ...f.item(), autoUpdate: false } : undefined)
    await f.fire()
    assert.equal(f.refreshes(), 0)
    assert.equal(f.timers.size, 0)
  }
})

test('an in-flight failure cannot restore a removed schedule', async () => {
  const f = fixture()
  let release!: () => void
  f.block(
    new Promise<void>((resolve) => {
      release = resolve
    })
  )
  f.scheduler.upsert(f.item())
  await f.fire()
  f.scheduler.remove('p')
  release()
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(f.timers.size, 0)
})

test('new settings replace old timers and invalid intervals never create timers', () => {
  const f = fixture()
  f.scheduler.upsert(f.item())
  f.scheduler.upsert({ ...f.item(), autoUpdate: false })
  assert.equal(f.timers.size, 0)
  for (const interval of [-1, 0, Infinity, NaN]) f.scheduler.upsert({ ...f.item(), interval })
  assert.equal(f.timers.size, 0)
})

test('long intervals use bounded timers and recheck their deadline instead of refreshing early', async () => {
  const f = fixture()
  f.setItem({ ...f.item(), interval: 100_000, updated: 1_000_000 })
  f.scheduler.upsert(f.item())
  assert.equal(f.nextDelay(), 2_147_483_647)
  await f.fire()
  assert.equal(f.refreshes(), 0)
  assert.equal(f.nextDelay(), 2_147_483_647)
})
