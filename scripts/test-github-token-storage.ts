import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import ts from 'typescript'

function createStore(t: TestContext, legacy = '') {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-github-token-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  let available = true
  let legacyToken = legacy
  let migrations = 0
  const source = ts.transpileModule(readFileSync('src/main/config/github-token.ts', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const dependencies: Record<string, unknown> = {
    'node:fs/promises': fsPromises,
    'node:path': path,
    electron: {
      safeStorage: {
        isEncryptionAvailable: () => available,
        getSelectedStorageBackend: () => 'mock',
        encryptString: (value: string) => Buffer.from(`sealed:${value}`),
        decryptString: (value: Buffer) => {
          const contents = value.toString()
          if (!contents.startsWith('sealed:')) throw new Error('invalid')
          return contents.slice('sealed:'.length)
        }
      }
    },
    '../utils/dirs': { dataDir: () => directory },
    './app': {
      getAppConfig: async () => ({ githubToken: legacyToken }),
      removeLegacyGitHubToken: async () => {
        migrations++
        legacyToken = ''
      }
    }
  }
  const module = { exports: {} as typeof import('../src/main/config/github-token') }
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
    path: path.join(directory, 'github-token.json'),
    setAvailable: (value: boolean) => {
      available = value
    },
    legacy: () => legacyToken,
    migrations: () => migrations
  }
}

test('legacy GitHub token migrates into encrypted storage before YAML cleanup', async (t) => {
  const store = createStore(t, 'old-secret')
  assert.equal(await store.api.getGitHubToken(), 'old-secret')
  assert.equal(store.legacy(), '')
  assert.equal(store.migrations(), 1)
  assert.doesNotMatch(readFileSync(store.path, 'utf8'), /old-secret/)

  await store.api.setGitHubToken('new-secret')
  assert.equal(await store.api.getGitHubToken(), 'new-secret')
  await store.api.setGitHubToken('')
  assert.equal(await store.api.isGitHubTokenConfigured(), false)
})

test('legacy token remains in config if secure storage cannot be written', async (t) => {
  const store = createStore(t, 'old-secret')
  store.setAvailable(false)
  await assert.rejects(store.api.getGitHubToken(), /secure storage is unavailable/)
  assert.equal(store.legacy(), 'old-secret')
  assert.equal(store.migrations(), 0)
})

test('renderer AppConfig IPC excludes GitHub token from reads and patch results', () => {
  const ipc = readFileSync('src/main/utils/ipc.ts', 'utf8')
  assert.match(ipc, /getAppConfig', \(_e, force\) =>[\s\S]*?githubToken: _githubToken/)
  assert.match(ipc, /patchAppConfig', \(_e, config\) =>[\s\S]*?githubToken: _githubToken/)
  assert.match(ipc, /Object\.hasOwn\(patch, 'githubToken'\)/)
  assert.match(
    readFileSync('src/main/index.ts', 'utf8'),
    /runStartupTask\('GitHub token migration', getGitHubToken\(\)\)/
  )
})
