import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import ts from 'typescript'
import { assertManagedConfig } from '../src/shared/managed-id'

function fixture(initial: OverrideItem[] = []) {
  const files = new Map<string, string>([
    ['/mock/override.yaml', JSON.stringify({ items: initial })]
  ])
  for (const item of initial) files.set(`/mock/${item.id}.${item.ext}`, 'original')
  const requests: ((value: { data: string }) => void)[] = []
  let configWrites = 0
  const dependencies: Record<string, unknown> = {
    'node:crypto': { randomUUID },
    'node:util': { isDeepStrictEqual },
    '../../shared/managed-id': { assertManagedConfig },
    '../../shared/i18n': { tr: (message: string) => message },
    '../utils/dirs': {
      overrideConfigPath: () => '/mock/override.yaml',
      overridePath: (id: string, ext: string) => `/mock/${id}.${ext}`
    },
    './controledMihomo': { getControledMihomoConfig: async () => ({ 'mixed-port': 0 }) },
    'fs/promises': {
      readFile: async (path: string) => files.get(path) || '',
      rm: async (path: string) => {
        files.delete(path)
      }
    },
    fs: { existsSync: (path: string) => files.has(path) },
    axios: {
      __esModule: true,
      default: {
        get: async () =>
          new Promise((resolve) => {
            requests.push(resolve)
          }),
        isAxiosError: () => false
      }
    },
    https: { __esModule: true, default: { Agent: class {} } },
    '../utils/yaml': { parseYaml: JSON.parse, stringifyYaml: JSON.stringify },
    '../utils/userAgent': { getUserAgent: async () => 'test' },
    '../utils/pinnedHttpsAgent': { createPinnedHttpsAgent: () => ({}) },
    './atomic-file': {
      writePrivateTextFileAtomic: async (path: string, content: string) => {
        if (path === '/mock/override.yaml') configWrites++
        files.set(path, content)
      }
    }
  }
  const code = ts.transpileModule(readFileSync('src/main/config/override.ts', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const exports = {} as typeof import('../src/main/config/override')
  new Function('require', 'exports', code)((name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), name)
    return dependencies[name]
  }, exports)
  return { api: exports, files, requests, configWrites: () => configWrites }
}
const remote = {
  id: 'p',
  type: 'remote',
  ext: 'yaml',
  name: 'Original',
  url: 'https://example.test/p',
  global: false,
  updated: 1
} as OverrideItem
async function tick() {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

test('parallel additions retain both entries and commit each configuration once', async () => {
  const f = fixture()
  await Promise.all(
    ['a', 'b'].map((id) => f.api.addOverrideItem({ id, type: 'local', ext: 'yaml', file: id }))
  )
  assert.deepEqual((await f.api.getOverrideConfig()).items.map((item) => item.id).sort(), [
    'a',
    'b'
  ])
  assert.equal(f.files.get('/mock/a.yaml'), 'a')
  assert.equal(f.files.get('/mock/b.yaml'), 'b')
  assert.equal(f.configWrites(), 2)
})

test('deletion during a download does not recreate content or metadata', async () => {
  const f = fixture([remote])
  const refresh = f.api.addOverrideItem(remote)
  await tick()
  await f.api.removeOverrideItem('p')
  f.requests[0]({ data: 'downloaded' })
  await refresh
  assert.deepEqual((await f.api.getOverrideConfig()).items, [])
  assert.equal(f.files.has('/mock/p.yaml'), false)
})

test('metadata edits during a download reject the old refresh and preserve user settings', async () => {
  const f = fixture([remote])
  const refresh = f.api.addOverrideItem(remote)
  await tick()
  await f.api.updateOverrideItem({ ...remote, global: true })
  f.requests[0]({ data: 'downloaded' })
  await assert.rejects(refresh, /Override changed during refresh/)
  assert.equal((await f.api.getOverrideConfig()).items[0].global, true)
  assert.equal(f.files.get('/mock/p.yaml'), 'original')
})

test('content edits invalidate an in-flight download even when metadata is unchanged', async () => {
  const f = fixture([remote])
  const refresh = f.api.addOverrideItem(remote)
  await tick()
  await f.api.setOverride('p', 'yaml', 'user edit')
  f.requests[0]({ data: 'downloaded' })
  await assert.rejects(refresh, /Override changed during refresh/)
  assert.equal(f.files.get('/mock/p.yaml'), 'user edit')
})

test('the mutation queue recovers from a failed operation and accepts the next update', async () => {
  const f = fixture([remote])
  await assert.rejects(f.api.updateOverrideItem({ ...remote, id: 'missing' }), /Override not found/)
  await f.api.updateOverrideItem({ ...remote, name: 'New name' })
  assert.equal((await f.api.getOverrideConfig()).items[0].name, 'New name')
})
