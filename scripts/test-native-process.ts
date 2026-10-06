import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCoreProcessRecord, stopRecordedCoreProcess } from '../src/main/core/native-process'

const identity = { pid: 123, executable: '/tmp/mihomo', started: '123:456' }
test('PID records reject malformed and overflowing values', () => {
  for (const value of ['123garbage', '-1', '0', '2147483648', '{"pid":123}']) {
    assert.equal(parseCoreProcessRecord(value), null)
  }
  assert.equal(parseCoreProcessRecord('123\n'), 123)
  assert.deepEqual(parseCoreProcessRecord(JSON.stringify(identity)), identity)
})
test('legacy PID adoption inspects the executable before stopping', async () => {
  let stopped = false
  assert.equal(
    await stopRecordedCoreProcess(123, '/tmp/mihomo', {
      inspectCoreProcess: async () => null,
      stopCoreProcess: async () => {
        stopped = true
        return true
      }
    }),
    false
  )
  assert.equal(stopped, false)
})
test('stored creation identity is passed intact to Native', async () => {
  assert.equal(
    await stopRecordedCoreProcess(identity, '/tmp/mihomo', {
      inspectCoreProcess: async () => {
        throw new Error('must not recapture stale identity')
      },
      stopCoreProcess: async (value) => {
        assert.deepEqual(value, identity)
        return false
      }
    }),
    false
  )
})
test('older Native cannot fall back to PID-only process termination', async () => {
  await assert.rejects(stopRecordedCoreProcess(123, '/tmp/mihomo', {}), /Update KokoroBox Native/)
})
