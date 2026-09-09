import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import {
  EARLY_TLS_DISCONNECT_MESSAGE,
  beginExpectedNetworkTransition,
  installEarlyTlsDisconnectRecovery,
  isEarlyTlsDisconnect,
  isExpectedNetworkTransition,
  resetExpectedNetworkTransitionForTest,
  type MainProcessErrorOrigin
} from '../src/main/utils/earlyTlsDisconnect'

test('recognizes an early TLS disconnect directly and through an error cause', () => {
  const tlsError = new Error(EARLY_TLS_DISCONNECT_MESSAGE)
  assert.equal(isEarlyTlsDisconnect(tlsError), true)
  assert.equal(isEarlyTlsDisconnect(new Error('request failed', { cause: tlsError })), true)
  assert.equal(isEarlyTlsDisconnect(new Error('socket reset')), false)
})

test('recovers only early TLS disconnect process errors', () => {
  const emitter = new EventEmitter()
  const reports: Array<{ error: Error; origin: MainProcessErrorOrigin }> = []
  const rethrows: unknown[] = []
  const uninstall = installEarlyTlsDisconnectRecovery(
    (error, origin) => reports.push({ error, origin }),
    emitter,
    (reason) => {
      rethrows.push(reason)
    }
  )
  const tlsError = new Error(EARLY_TLS_DISCONNECT_MESSAGE)

  emitter.emit(
    'unhandledRejection',
    tlsError,
    Promise.reject().catch(() => {})
  )
  emitter.emit('uncaughtException', tlsError, 'unhandledRejection')

  assert.deepEqual(
    reports.map(({ origin }) => origin),
    ['unhandledRejection', 'uncaughtException']
  )
  assert.deepEqual(rethrows, [])

  const programmingError = new Error('programming error')
  emitter.emit('uncaughtException', programmingError, 'uncaughtException')
  assert.deepEqual(rethrows, [programmingError])
  assert.equal(emitter.listenerCount('uncaughtException'), 0)
  assert.equal(emitter.listenerCount('unhandledRejection'), 0)

  uninstall()
})

test('tracks nested expected network transitions and keeps a completion grace period', () => {
  resetExpectedNetworkTransitionForTest()
  let now = 1_000
  const clock = (): number => now
  const finishFirst = beginExpectedNetworkTransition(clock, 5_000)
  const finishSecond = beginExpectedNetworkTransition(clock, 5_000)

  assert.equal(isExpectedNetworkTransition(now), true)
  finishFirst()
  assert.equal(isExpectedNetworkTransition(now), true)

  now = 2_000
  finishSecond()
  assert.equal(isExpectedNetworkTransition(6_999), true)
  assert.equal(isExpectedNetworkTransition(7_001), false)

  // Completion callbacks are idempotent and cannot corrupt transition depth.
  finishSecond()
  assert.equal(isExpectedNetworkTransition(7_001), false)
  resetExpectedNetworkTransitionForTest()
})
