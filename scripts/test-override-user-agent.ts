import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

type RequestConfig = {
  headers?: Record<string, string>
}

function loadOverrideModule(defaultUserAgent = 'KokoroBox/default') {
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
      writeFile: async () => undefined,
      rm: async () => undefined
    },
    fs: { existsSync: () => false },
    axios: { __esModule: true, default: axios },
    https: { __esModule: true, default: { Agent: class {} } },
    http: { __esModule: true, default: {} },
    tls: { __esModule: true, default: {} },
    '../utils/yaml': {
      parseYaml: () => ({ items: [] }),
      stringifyYaml: () => ''
    },
    './profile': { getCertFingerprint: () => '' },
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
  const item = await loaded.api.createOverride({
    type: 'remote',
    ext: 'yaml',
    name: 'Remote override',
    url: 'https://example.invalid/override.yaml',
    ua: '  CustomClient/1.0  '
  })

  assert.equal(item.ua, 'CustomClient/1.0')
  assert.equal(loaded.getRequest()?.config.headers?.['User-Agent'], 'CustomClient/1.0')
  assert.equal(loaded.getDefaultUserAgentCalls(), 0)
})

test('remote overrides use the application User-Agent when left blank', async () => {
  const loaded = loadOverrideModule('KokoroBox/fallback')
  const item = await loaded.api.createOverride({
    type: 'remote',
    ext: 'yaml',
    url: 'https://example.invalid/override.yaml',
    ua: '   '
  })

  assert.equal(item.ua, undefined)
  assert.equal(loaded.getRequest()?.config.headers?.['User-Agent'], 'KokoroBox/fallback')
  assert.equal(loaded.getDefaultUserAgentCalls(), 1)
})
