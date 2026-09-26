import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Worker } from 'node:worker_threads'
import { resolve } from 'node:path'
import { executeOverride } from '../src/main/core/override-execution'

function worker(script: string): Worker {
  return new Worker(
    `require('tsx/cjs'); require(${JSON.stringify(resolve('src/main/core/override-worker.ts'))})`,
    {
      eval: true,
      workerData: { script, profile: { mode: 'rule' } }
    }
  )
}

test('override runs async scripts with the existing helpers', async () => {
  const result = await executeOverride(() =>
    worker(`async function main(profile) {
    console.info('working');
    profile.mode = yaml.parse('mode: global').mode;
    profile.secret = b64d(b64e('Kokoro'));
    return profile;
  }`)
  )
  assert.equal(result.error, undefined)
  assert.equal(result.profile?.mode, 'global')
  assert.equal(result.profile?.secret, 'Kokoro')
  assert.match(result.logs, /working/)
})

test('a synchronous infinite loop is terminated without blocking the parent', async () => {
  let ticks = 0
  const timer = setInterval(() => ticks++, 10)
  let instance: Worker | undefined
  try {
    const result = await executeOverride(
      () => (instance = worker('function main() { while (true) {} }')),
      500
    )
    assert.match(result.error!, /timed out/)
    assert.ok(ticks > 1)
    assert.equal(instance?.threadId, -1)
  } finally {
    clearInterval(timer)
  }
})
