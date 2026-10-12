import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { assertManagedConfig } from '../src/shared/managed-id'

type RequestConfig = {
  headers?: Record<string, string>
}

function loadOverrideModule(
  defaultUserAgent = 'KokoroBox/default',
  writeFile: (path: string, content: string, encoding: string) => Promise<void> = async () =>
    undefined
) {
  let request: { url: string; config: RequestConfig } | undefined
  let defaultUserAgentCalls = 0
  const axios = {
    get: async (url: string, config: RequestConfig) => {
      request = { url, config }
      return { data: 'rules: []' }
    },
    isAxiosError: () => false
  }
  const dependencies: Record<string, unknown> = {
    'node:crypto': { randomUUID },
    'node:util': { isDeepStrictEqual },
    '../../shared/managed-id': { assertManagedConfig },
    '../../shared/i18n': { tr: (message: string) => message },
    '../utils/dirs': {
      overrideConfigPath: () => '/mock/override.yaml',
      overridePath: (id: string, ext: string) => `/mock/${id}.${ext}`
    },
    './controledMihomo': {
      getControledMihomoConfig: async () => ({ 'mixed-port': 0 })
    },
    'fs/promises': {
      readFile: async () => '',
      writeFile,
      rename: async () => undefined,
      unlink: async () => undefined,
      rm: async () => undefined
    },
    fs: { existsSync: () => false },
    axios: { __esModule: true, default: axios },
    https: { __esModule: true, default: { Agent: class {} } },
    '../utils/yaml': {
      parseYaml: () => ({ items: [] }),
      stringifyYaml: () => ''
    },
    '../utils/pinnedHttpsAgent': { createPinnedHttpsAgent: () => ({}) },
    './atomic-file': {
      writePrivateTextFileAtomic: async (path: string, content: string) =>
        writeFile(`${path}.tmp`, content, 'utf-8')
    },
    '../utils/userAgent': {
      getUserAgent: async () => {
        defaultUserAgentCalls++
        return defaultUserAgent
      }
    }
  }
  const source = ts.transpileModule(readFileSync('src/main/config/override.ts', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} as typeof import('../src/main/config/override') }
  new Function('require', 'module', 'exports', source)(
    (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
      return dependencies[name]
    },
    module,
    module.exports
  )
  return {
    api: module.exports,
    getRequest: () => request,
    getDefaultUserAgentCalls: () => defaultUserAgentCalls
  }
}

test('remote overrides persist and send their custom User-Agent', async () => {
  const loaded = loadOverrideModule()
  await loaded.api.addOverrideItem({
    type: 'remote',
    ext: 'yaml',
    name: 'Remote override',
    url: 'https://example.invalid/override.yaml',
    ua: '  CustomClient/1.0  '
  })

  const item = (await loaded.api.getOverrideConfig()).items[0]
  assert.equal(item.ua, 'CustomClient/1.0')
  assert.equal(loaded.getRequest()?.config.headers?.['User-Agent'], 'CustomClient/1.0')
  assert.equal(loaded.getDefaultUserAgentCalls(), 0)
})

test('remote overrides use the application User-Agent when left blank', async () => {
  const loaded = loadOverrideModule('KokoroBox/fallback')
  await loaded.api.addOverrideItem({
    type: 'remote',
    ext: 'yaml',
    url: 'https://example.invalid/override.yaml',
    ua: '   '
  })

  const item = (await loaded.api.getOverrideConfig()).items[0]
  assert.equal(item.ua, undefined)
  assert.equal(loaded.getRequest()?.config.headers?.['User-Agent'], 'KokoroBox/fallback')
  assert.equal(loaded.getDefaultUserAgentCalls(), 1)
})

test('local override creation waits for persistent content writes', async () => {
  const loaded = loadOverrideModule('KokoroBox/default', async () => {
    throw new Error('write failure')
  })

  await assert.rejects(
    loaded.api.addOverrideItem({
      type: 'local',
      ext: 'yaml',
      file: 'rules: []'
    }),
    /write failure/
  )
})

test('failed override config writes do not mutate the shared cache', async () => {
  const loaded = loadOverrideModule('KokoroBox/default', async () => {
    throw new Error('config write failure')
  })
  const initial = await loaded.api.getOverrideConfig()

  await assert.rejects(
    loaded.api.setOverrideConfig({
      items: [
        {
          id: 'new',
          name: 'New override',
          type: 'local',
          ext: 'yaml',
          global: false,
          updated: 1
        }
      ]
    }),
    /config write failure/
  )

  assert.deepEqual(await loaded.api.getOverrideConfig(), initial)
})

test('override config reads return clones rather than mutable cache references', async () => {
  const loaded = loadOverrideModule()
  const first = await loaded.api.getOverrideConfig()
  first.items.push({
    id: 'mutated',
    name: 'Mutated',
    type: 'local',
    ext: 'yaml',
    global: false,
    updated: 1
  })

  assert.deepEqual((await loaded.api.getOverrideConfig()).items, [])
})
