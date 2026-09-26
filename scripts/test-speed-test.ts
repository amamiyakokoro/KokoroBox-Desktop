import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runCloudflareSpeedTest } from '../src/renderer/src/utils/cloudflare-speed-test.ts'

function fixture() {
  let time = 0
  const calls: { method: string; bytes: number }[] = []
  const controller = new AbortController()
  return {
    calls,
    controller,
    options: {
      signal: controller.signal,
      phaseBytes: 250_000,
      now: () => time,
      onProgress: () => {},
      fetch: (async (input, init) => {
        const bytes = Number(new URL(String(input)).searchParams.get('bytes'))
        const method = init?.method || 'GET'
        calls.push({ method, bytes })
        time += 10
        return {
          ok: true,
          headers: new Headers(),
          arrayBuffer: async () => {
            time += 90 // Include body transfer, not just response headers.
            return new ArrayBuffer(method === 'POST' ? 0 : bytes || 67)
          }
        } as Response
      }) as typeof fetch
    }
  }
}

test('measures complete transfers without Resource Timing and respects data budgets', async () => {
  const { options, calls } = fixture()
  const result = await runCloudflareSpeedTest(options)
  assert.deepEqual(result, { latency: 100, jitter: 0, download: 10_000_000, upload: 10_000_000 })
  assert.equal(calls.filter((call) => call.bytes === 0).length, 6)
  for (const method of ['GET', 'POST']) {
    assert.equal(
      calls.filter((call) => call.method === method).reduce((sum, call) => sum + call.bytes, 0),
      250_000
    )
  }
})

test('stopping an active request aborts its signal and never starts upload', async () => {
  const { options, controller } = fixture()
  let calls = 0
  options.fetch = (async (_input, init) => {
    calls++
    return new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))
      controller.abort()
    })
  }) as typeof fetch
  await assert.rejects(runCloudflareSpeedTest(options), { name: 'AbortError' })
  assert.equal(calls, 1)
})

test('a stopped run can be followed by a fresh successful run', async () => {
  const first = fixture()
  first.controller.abort()
  await assert.rejects(runCloudflareSpeedTest(first.options), { name: 'AbortError' })
  assert.equal(first.calls.length, 0)
  assert.ok((await runCloudflareSpeedTest(fixture().options)).upload! > 0)
})

test('a stalled request times out and does not advance to another phase', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const { options } = fixture()
  let calls = 0
  options.fetch = (async (_input, init) => {
    calls++
    return new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))
    })
  }) as typeof fetch
  const result = runCloudflareSpeedTest(options)
  const rejected = assert.rejects(result, /Measurement timed out/)
  context.mock.timers.tick(15_000)
  await rejected
  assert.equal(calls, 1)
})

test('slow transfers end each bandwidth phase at its duration budget', async () => {
  const { options, calls } = fixture()
  const result = await runCloudflareSpeedTest({ ...options, phaseDurationMs: 50 })
  assert.ok(result.download! > 0 && result.upload! > 0)
  assert.equal(calls.filter((call) => call.bytes > 0).length, 2)
})

test('HTTP failures and incomplete downloads fail instead of producing zero results', async () => {
  const { options } = fixture()
  const valid = options.fetch
  options.fetch = async () => new Response(null, { status: 503 })
  await assert.rejects(runCloudflareSpeedTest(options), /HTTP 503/)
  options.fetch = async (input, init) =>
    Number(new URL(String(input)).searchParams.get('bytes')) > 0
      ? new Response('wrong body')
      : valid(input, init)
  await assert.rejects(runCloudflareSpeedTest(options), /Incomplete download/)
})

test('invalid clocks and upload error pages are rejected', async () => {
  const { options } = fixture()
  const original = options.fetch
  const now = options.now
  options.now = () => 0
  await assert.rejects(runCloudflareSpeedTest(options), /Invalid measurement timing/)
  options.now = now
  options.fetch = async (input, init) =>
    init?.method === 'POST'
      ? new Response('<html>Error</html>', { headers: { 'content-type': 'text/html' } })
      : original(input, init)
  await assert.rejects(runCloudflareSpeedTest(options), /Invalid measurement response/)
})
