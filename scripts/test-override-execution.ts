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

test('an infinite async microtask chain is terminated by the same deadline', async () => {
  const result = await executeOverride(
    () => worker('async function main() { while (true) { await Promise.resolve() } }'),
    500
  )
  assert.match(result.error!, /timed out/)
  assert.equal(result.profile, undefined)
})

test('a never-resolving promise cannot hold profile generation indefinitely', async () => {
  const result = await executeOverride(
    () => worker('function main() { return new Promise(() => {}) }'),
    500
  )
  assert.match(result.error!, /timed out|exited before returning/)
  assert.equal(result.profile, undefined)
})

test('script exceptions and invalid return values do not replace the profile', async () => {
  for (const script of [
    'function main() { throw new Error("bad override") }',
    'function main() { return null }',
    'function main() { return [] }'
  ]) {
    const result = await executeOverride(() => worker(script))
    assert.ok(result.error)
    assert.equal(result.profile, undefined)
  }
})

test('log floods are bounded and the worker still returns a valid result', async () => {
  const result = await executeOverride(() =>
    worker(`function main(profile) {
    for (let i = 0; i < 100000; i++) console.log('x'.repeat(1000));
    return profile;
  }`)
  )
  assert.equal(result.error, undefined)
  assert.ok(Buffer.byteLength(result.logs) <= 64 * 1024 + 100)
  assert.match(result.logs, /log limit reached/)
  assert.equal(result.profile?.mode, 'rule')
})
