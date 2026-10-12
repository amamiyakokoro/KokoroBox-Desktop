import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function fixture() {
  let reads = 0
  const waits: ((context: { online: boolean } | null) => void)[] = []
  const code = ts.transpileModule(readFileSync('src/main/sys/network-context.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports = {}
  new Function('require', 'exports', code)((id: string) => {
    if (id === 'kokorobox-native')
      return {
        getNetworkContext: async () => {
          reads++
          return { online: reads === 1 }
        },
        waitForNetworkContextChange: async () =>
          new Promise((resolve) => {
            waits.push(resolve)
          })
      }
    if (id === '../utils/log') return { appendAppLog: async () => {} }
    throw new Error(`unexpected dependency ${id}`)
  }, exports)
  return {
    ...(exports as {
      observeNetworkContext: (listener: (context: { online: boolean }) => void) => () => void
      readNetworkContext: () => Promise<{ online: boolean }>
    }),
    waits,
    reads: () => reads
  }
}
async function tick() {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

test('resubscribing while an old Native wait is pending restarts the watcher and ignores stale results', async () => {
  const f = fixture()
  const events: boolean[] = []
  const old = f.observeNetworkContext(() => {})
  await tick()
  old()
  const stop = f.observeNetworkContext((context) => events.push(context.online))
  f.waits[0]({ online: true })
  await tick()
  assert.equal(f.reads(), 2)
  assert.equal(f.waits.length, 2)
  assert.deepEqual(events, [false])
  f.waits[1]({ online: true })
  await tick()
  assert.deepEqual(events, [false, true])
  stop()
  f.waits.at(-1)!(null)
  await tick()
})

test('throwing listeners do not stop other listeners or the watcher', async () => {
  const f = fixture()
  const bad = f.observeNetworkContext(() => {
    throw new Error('listener failed')
  })
  const events: boolean[] = []
  const good = f.observeNetworkContext((context) => events.push(context.online))
  await tick()
  f.waits[0]({ online: false })
  await tick()
  assert.deepEqual(events, [true, false])
  bad()
  good()
  f.waits.at(-1)!(null)
  await tick()
})

test('after the final unsubscribe, direct reads fetch fresh context instead of stale cached state', async () => {
  const f = fixture()
  const stop = f.observeNetworkContext(() => {})
  await tick()
  stop()
  assert.deepEqual(await f.readNetworkContext(), { online: false })
  assert.equal(f.reads(), 2)
  f.waits[0](null)
  await tick()
})
