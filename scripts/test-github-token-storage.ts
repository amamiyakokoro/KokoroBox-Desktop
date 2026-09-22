import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import ts from 'typescript'

function createStore(t: TestContext, legacy = '', legacyWebdav = '') {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-github-token-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  let available = true
  let failReplace = false
  let legacyToken = legacy
  let legacyWebdavPassword = legacyWebdav
  let migrations = 0
  const secureDependencies: Record<string, unknown> = {
    'node:fs/promises': {
      ...fsPromises,
      rename: async (from: string, to: string) => {
        if (failReplace && from.endsWith('.tmp')) throw new Error('replace failed')
        return fsPromises.rename(from, to)
      }
    },
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
    '../utils/dirs': { dataDir: () => directory }
  }
  const secureStore = loadModule<typeof import('../src/main/config/secure-string')>(
    'src/main/config/secure-string.ts',
    secureDependencies
  )
  const dependencies: Record<string, unknown> = {
    './secure-string': secureStore,
    './app': {
      getAppConfig: async () => ({
        githubToken: legacyToken,
        webdavPassword: legacyWebdavPassword
      }),
      removeLegacyAppSecret: async (key: string) => {
        migrations++
        if (key === 'githubToken') legacyToken = ''
        else if (key === 'webdavPassword') legacyWebdavPassword = ''
        else assert.fail(`Unexpected secret key: ${key}`)
      }
    }
  }
  const api = loadModule<typeof import('../src/main/config/github-token')>(
    'src/main/config/github-token.ts',
    dependencies
  )
  const webdavApi = loadModule<typeof import('../src/main/config/webdav-password')>(
    'src/main/config/webdav-password.ts',
    dependencies
  )
  return {
    api,
    webdavApi,
    secureStore,
    path: path.join(directory, 'github-token.json'),
    setAvailable: (value: boolean) => {
      available = value
    },
    setFailReplace: (value: boolean) => {
      failReplace = value
    },
    legacy: () => legacyToken,
    legacyWebdav: () => legacyWebdavPassword,
    migrations: () => migrations
  }
}

function loadModule<T>(file: string, dependencies: Record<string, unknown>): T {
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} as T }
  new Function('require', 'module', 'exports', source)(
    (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
      return dependencies[name]
    },
    module,
    module.exports
  )
  return module.exports
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

test('legacy WebDAV password migrates and backup operations can read the secure value', async (t) => {
  const store = createStore(t, '', 'old-webdav-password')
  assert.equal(await store.webdavApi.getWebdavPassword(), 'old-webdav-password')
  assert.equal(store.legacyWebdav(), '')
  assert.doesNotMatch(
    readFileSync(path.join(path.dirname(store.path), 'webdav-password.json'), 'utf8'),
    /old-webdav-password/
  )
  await store.webdavApi.setWebdavPassword('new-webdav-password')
  assert.equal(await store.webdavApi.getWebdavPassword(), 'new-webdav-password')
  await store.webdavApi.setWebdavPassword('')
  assert.equal(await store.webdavApi.isWebdavPasswordConfigured(), false)

  const backup = readFileSync('src/main/resolve/backup.ts', 'utf8')
  assert.equal((backup.match(/await getWebdavPassword\(\)/g) ?? []).length, 4)
})

test('failed WebDAV password replacement preserves the existing credential', async (t) => {
  const store = createStore(t, '', 'old-password')
  assert.equal(await store.webdavApi.getWebdavPassword(), 'old-password')
  store.setFailReplace(true)
  await assert.rejects(store.webdavApi.setWebdavPassword('new-password'), /replace failed/)
  assert.equal(await store.webdavApi.getWebdavPassword(), 'old-password')
})

test('renderer AppConfig IPC excludes GitHub token from reads and patch results', () => {
  const ipc = readFileSync('src/main/utils/ipc.ts', 'utf8')
  assert.match(ipc, /getAppConfig', \(_e, force\) =>[\s\S]*?githubToken: _githubToken/)
  assert.match(ipc, /patchAppConfig', \(_e, config\) =>[\s\S]*?githubToken: _githubToken/)
  assert.match(ipc, /Object\.hasOwn\(patch, 'githubToken'\)/)
  assert.match(ipc, /Object\.hasOwn\(patch, 'webdavPassword'\)/)
  assert.match(ipc, /webdavPassword: _webdavPassword/)
  assert.match(
    readFileSync('src/main/index.ts', 'utf8'),
    /runStartupTask\('GitHub token migration', getGitHubToken\(\)\)/
  )
})
