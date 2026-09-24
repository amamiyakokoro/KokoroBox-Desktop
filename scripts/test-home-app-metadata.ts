// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../src/preload/index.d.ts" />
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('application metadata shares concurrent local lookups and caches failures', async () => {
  const calls = new Map<string, number>()
  let activeNames = 0
  let maximumActiveNames = 0
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: { platform: 'darwin' },
      electron: {
        ipcRenderer: {
          invoke: async (channel: string, path: string) => {
            const key = `${channel}:${path}`
            calls.set(key, (calls.get(key) ?? 0) + 1)
            if (path === '/missing.app') throw new Error('missing')
            if (channel === 'getAppName' && path.startsWith('/slow/')) {
              activeNames += 1
              maximumActiveNames = Math.max(maximumActiveNames, activeNames)
              await new Promise((resolve) => {
                setTimeout(resolve, 5)
              })
              activeNames -= 1
            }
            return channel === 'getAppName' ? 'Discord' : 'data:image/png;base64,AA=='
          }
        }
      }
    }
  })
  try {
    const { loadApplicationMetadata } =
      await import('../src/renderer/src/utils/application-metadata.ts')
    const first = loadApplicationMetadata('/Applications/Discord.app')
    const concurrent = loadApplicationMetadata('/Applications/Discord.app')
    assert.equal(first, concurrent)
    assert.deepEqual(await first, {
      name: 'Discord',
      iconUrl: 'data:image/png;base64,AA=='
    })
    assert.deepEqual(await loadApplicationMetadata('/Applications/Discord.app'), await first)
    assert.equal(calls.get('getAppName:/Applications/Discord.app'), 1)
    assert.equal(calls.get('getIconDataURL:/Applications/Discord.app'), 1)

    assert.deepEqual(await loadApplicationMetadata('/missing.app'), {
      name: undefined,
      iconUrl: undefined
    })
    assert.deepEqual(await loadApplicationMetadata('/missing.app'), {
      name: undefined,
      iconUrl: undefined
    })
    assert.equal(calls.get('getAppName:/missing.app'), 1)
    assert.equal(calls.get('getIconDataURL:/missing.app'), 1)

    await Promise.all(
      Array.from({ length: 7 }, (_, index) => loadApplicationMetadata(`/slow/${index}.app`))
    )
    assert.equal(maximumActiveNames <= 3, true)
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  }
})
