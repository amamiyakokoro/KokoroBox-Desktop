import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createDnsLeaseController } from '../src/main/core/dns-lease-controller'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
test('stop during an in-flight 409 renewal prevents stale reacquisition', async () => {
  const entered = deferred()
  const finish = deferred()
  const calls: string[] = []
  const controller = createDnsLeaseController({
    acquire: async () => {
      calls.push('acquire')
    },
    renew: async () => {
      entered.resolve()
      await finish.promise
      throw new Error('409')
    },
    release: async () => {
      calls.push('release')
    },
    isMissingLease: () => true,
    onError: (e) => {
      throw e
    },
    intervalMs: 1
  })
  await controller.start()
  await Promise.race([
    entered.promise,
    delay(1000).then(() => {
      throw new Error('renewal did not start')
    })
  ])
  const stopping = controller.stop()
  finish.resolve()
  await stopping
  assert.deepEqual(calls, ['acquire', 'release'])
})
test('release waits for an already-started recovery acquisition', async () => {
  const entered = deferred()
  const finish = deferred()
  const calls: string[] = []
  let acquisitions = 0
  const controller = createDnsLeaseController({
    acquire: async () => {
      calls.push('acquire')
      if (++acquisitions === 2) {
        entered.resolve()
        await finish.promise
      }
    },
    renew: async () => {
      throw new Error('409')
    },
    release: async () => {
      calls.push('release')
    },
    isMissingLease: () => true,
    onError: (e) => {
      throw e
    },
    intervalMs: 1
  })
  await controller.start()
  await Promise.race([
    entered.promise,
    delay(1000).then(() => {
      throw new Error('recovery did not start')
    })
  ])
  const stopping = controller.stop()
  finish.resolve()
  await stopping
  assert.deepEqual(calls, ['acquire', 'acquire', 'release'])
})
