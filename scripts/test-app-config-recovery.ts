import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import ts from 'typescript'
import {
  hardenAppConfigPermissions,
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

test('app config writes and backups use owner-only permissions on Unix', async (t) => {
  const configPath = withConfigPath(t)
  writeFileSync(configPath, validBackup, { mode: 0o644 })

  await writeAppConfigFile(configPath, validMain, 'linux')

  assert.equal(statSync(configPath).mode & 0o777, 0o600)
  assert.equal(statSync(`${configPath}.backup`).mode & 0o777, 0o600)
})

test('existing app config files are hardened to owner-only permissions', async (t) => {
  const configPath = withConfigPath(t)
  writeFileSync(configPath, validMain)
  writeFileSync(`${configPath}.backup`, validBackup)
  chmodSync(configPath, 0o644)
  chmodSync(`${configPath}.backup`, 0o644)

  await hardenAppConfigPermissions(configPath, 'linux')

  assert.equal(statSync(configPath).mode & 0o777, 0o600)
  assert.equal(statSync(`${configPath}.backup`).mode & 0o777, 0o600)
})

test('initial app config creation uses the hardened atomic writer', () => {
  const init = readFileSync('src/main/utils/init.ts', 'utf8')

  assert.match(init, /writeAppConfigFile\(appConfigPath\(\), stringifyYaml\(defaultConfig\)\)/)
  assert.match(init, /await hardenAppConfigPermissions\(appConfigPath\(\)\)/)
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

function loadTransactionalControlledConfigModule() {
  const defaultConfig = {
    dns: { enable: true, ipv6: true, nameserver: ['default.example'] },
    sniffer: { enable: true }
  } as Partial<MihomoConfig>
  let persistedConfig = {
    dns: { enable: true },
    sniffer: { enable: true }
  } as Partial<MihomoConfig>
  let writeError: Error | undefined
  const generatedConfigs: Partial<MihomoConfig>[] = []
  const source = ts.transpileModule(readFileSync('src/main/config/controledMihomo.ts', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const dependencies: Record<string, unknown> = {
    '../utils/dirs': { controledMihomoConfigPath: () => '/mock/mihomo.yaml' },
    'fs/promises': {
      readFile: async () => JSON.stringify(persistedConfig),
      writeFile: async (_path: string, content: string) => {
        if (writeError) throw writeError
        persistedConfig = JSON.parse(content) as Partial<MihomoConfig>
      }
    },
    '../utils/yaml': {
      parseYaml: (content: string) => JSON.parse(content),
      stringifyYaml: (value: Partial<MihomoConfig>) => JSON.stringify(value)
    },
    '../core/factory': {
      generateProfile: async (config: Partial<MihomoConfig>) => {
        generatedConfigs.push(structuredClone(config))
      }
    },
    './app': {
      getAppConfig: async () => ({ controlDns: true, controlSniff: true })
    },
    '../utils/template': { defaultControledMihomoConfig: defaultConfig },
    '../utils/merge': { deepMerge }
  }
  const module = { exports: {} as typeof import('../src/main/config/controledMihomo') }
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
    generatedConfigs,
    failWrites(error: Error) {
      writeError = error
    },
    allowWrites() {
      writeError = undefined
    },
    persisted: () => structuredClone(persistedConfig)
  }
}

test('controlled Mihomo writes are serialized without mutating defaults or failed-write cache', async () => {
  const loaded = loadTransactionalControlledConfigModule()
  await loaded.api.getControledMihomoConfig()
  loaded.failWrites(new Error('write failure'))

  await assert.rejects(
    loaded.api.patchControledMihomoConfig({ dns: { nameserver: ['changed.example'] } }),
    /write failure/
  )

  assert.deepEqual((await loaded.api.getControledMihomoConfig()).dns, { enable: true })
  assert.deepEqual(loaded.persisted().dns, { enable: true })
  assert.deepEqual(loaded.defaultConfig.dns?.nameserver, ['default.example'])
  assert.deepEqual(loaded.generatedConfigs.at(-1)?.dns?.nameserver, ['changed.example'])

  loaded.allowWrites()
  await loaded.api.patchControledMihomoConfig({ dns: { nameserver: ['saved.example'] } })
  assert.deepEqual((await loaded.api.getControledMihomoConfig()).dns?.nameserver, ['saved.example'])
  assert.deepEqual(loaded.persisted().dns?.nameserver, ['saved.example'])
})
