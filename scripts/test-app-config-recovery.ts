import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import ts from 'typescript'
import {
  loadAppConfigFile,
  loadAppConfigFileSync,
  shouldSeedDefaultAppConfig,
  writeAppConfigFile
} from '../src/main/config/app-loader'
import { deepMerge } from '../src/main/utils/merge'

const validMain = 'language: en\nsysProxy:\n  enable: true\n'
const validBackup = 'language: zh-Hant\nsysProxy:\n  enable: false\n'

function withConfigPath(t: TestContext): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-config-recovery-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return path.join(directory, 'config.yaml')
}

async function assertBothLoaders(configPath: string, expectedLanguage?: string): Promise<void> {
  assert.equal((await loadAppConfigFile(configPath))?.language, expectedLanguage)
  assert.equal(loadAppConfigFileSync(configPath)?.language, expectedLanguage)
}

test('valid primary config takes precedence over backup', async (t) => {
  const configPath = withConfigPath(t)
  writeFileSync(configPath, validMain)
  writeFileSync(`${configPath}.backup`, validBackup)
  await assertBothLoaders(configPath, 'en')
})

test('missing, corrupt, and unreadable primary configs recover from a valid backup', async (t) => {
  const configPath = withConfigPath(t)
  assert.equal(shouldSeedDefaultAppConfig(configPath), true)
  writeFileSync(`${configPath}.backup`, validBackup)
  assert.equal(shouldSeedDefaultAppConfig(configPath), false)
  await assertBothLoaders(configPath, 'zh-Hant')

  writeFileSync(configPath, 'language: en\nsysProxy: [invalid]\n')
  await assertBothLoaders(configPath, 'zh-Hant')

  rmSync(configPath)
  mkdirSync(configPath)
  await assertBothLoaders(configPath, 'zh-Hant')
})

test('both invalid candidates leave selection to the default config', async (t) => {
  const configPath = withConfigPath(t)
  writeFileSync(configPath, 'sysProxy: null\n')
  writeFileSync(`${configPath}.backup`, 'sysProxy: [invalid]\n')
  await assertBothLoaders(configPath)
})

test('writing after backup recovery preserves the valid backup', async (t) => {
  const configPath = withConfigPath(t)
  writeFileSync(configPath, 'sysProxy: [damaged]\n')
  writeFileSync(`${configPath}.backup`, validBackup)

  await writeAppConfigFile(configPath, validMain, 'win32')

  assert.equal(readFileSync(`${configPath}.backup`, 'utf8'), validBackup)
  await assertBothLoaders(configPath, 'en')
})

function loadTransactionalAppConfigModule() {
  const defaultConfig = {
    language: 'system',
    sysProxy: { enable: false, mode: 'manual' }
  } as AppConfig
  let persistedConfig = structuredClone(defaultConfig)
  let writeError: Error | undefined
  const source = ts.transpileModule(readFileSync('src/main/config/app.ts', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const dependencies: Record<string, unknown> = {
    '../utils/dirs': { appConfigPath: () => '/mock/config.yaml' },
    '../utils/yaml': { stringifyYaml: (value: AppConfig) => JSON.stringify(value) },
    '../utils/merge': { deepMerge },
    '../utils/template': { defaultConfig },
    '../../shared/build-flags': {
      systemCoreDefaultPath: '',
      systemCoreOnlyBuild: false
    },
    './app-loader': {
      loadAppConfigFile: async () => structuredClone(persistedConfig),
      loadAppConfigFileSync: () => structuredClone(persistedConfig),
      writeAppConfigFile: async (_path: string, content: string) => {
        if (writeError) throw writeError
        persistedConfig = JSON.parse(content) as AppConfig
      }
    }
  }
  const module = { exports: {} as typeof import('../src/main/config/app') }
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
    defaultConfig,
    failNextWrite(error: Error) {
      writeError = error
    },
    allowWrites() {
      writeError = undefined
    },
    persisted: () => structuredClone(persistedConfig)
  }
}

test('failed app config writes do not commit cache changes or mutate defaults', async () => {
  const loaded = loadTransactionalAppConfigModule()
  const initial = await loaded.api.getAppConfig()
  assert.equal(initial.sysProxy.enable, false)
  loaded.failNextWrite(new Error('disk full'))

  await assert.rejects(loaded.api.patchAppConfig({ sysProxy: { enable: true } }), /disk full/)

  assert.equal((await loaded.api.getAppConfig()).sysProxy.enable, false)
  assert.equal(loaded.defaultConfig.sysProxy.enable, false)
  assert.equal(loaded.persisted().sysProxy.enable, false)

  loaded.allowWrites()
  await loaded.api.patchAppConfig({ sysProxy: { enable: true } })
  assert.equal((await loaded.api.getAppConfig()).sysProxy.enable, true)
  assert.equal(loaded.persisted().sysProxy.enable, true)
})
