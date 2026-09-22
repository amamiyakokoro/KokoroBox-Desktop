import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import ts from 'typescript'

function createStore(t: TestContext, legacy = '', legacyWebdav = '', legacyAge = '') {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-github-token-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  let available = true
  let failReplace = false
  let failPatch = false
  let legacyToken = legacy
  let legacyWebdavPassword = legacyWebdav
  let legacyGistAgeIdentity = legacyAge
  let gistAgeRecipient = ''
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
        webdavPassword: legacyWebdavPassword,
        gistAgeIdentity: legacyGistAgeIdentity,
        gistAgeRecipient
      }),
      patchAppConfig: async (patch: { gistAgeRecipient: string }) => {
        if (failPatch) throw new Error('config write failed')
        gistAgeRecipient = patch.gistAgeRecipient
      },
      removeLegacyAppSecret: async (key: string) => {
        migrations++
        if (key === 'githubToken') legacyToken = ''
        else if (key === 'webdavPassword') legacyWebdavPassword = ''
        else if (key === 'gistAgeIdentity') legacyGistAgeIdentity = ''
        else assert.fail(`Unexpected secret key: ${key}`)
      }
    },
    '../utils/age': {
      ageIdentityToRecipient: async (identity: string) => {
        if (!identity.startsWith('AGE-SECRET-KEY-')) throw new Error('Invalid age private key')
        return `age1${identity.slice('AGE-SECRET-KEY-'.length).toLowerCase()}`
      },
      generateAgeKeyPair: async () => ({ identity: 'AGE-SECRET-KEY-NEW', recipient: 'age1new' })
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
  const ageApi = loadModule<typeof import('../src/main/config/gist-age-identity')>(
    'src/main/config/gist-age-identity.ts',
    dependencies
  )
  return {
    api,
    webdavApi,
    ageApi,
    secureStore,
    path: path.join(directory, 'github-token.json'),
    setAvailable: (value: boolean) => {
      available = value
    },
    setFailReplace: (value: boolean) => {
      failReplace = value
    },
    setFailPatch: (value: boolean) => {
      failPatch = value
    },
    legacy: () => legacyToken,
    legacyWebdav: () => legacyWebdavPassword,
    legacyAge: () => legacyGistAgeIdentity,
    recipient: () => gistAgeRecipient,
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

test('Gist age identity migration and generation keep the private key out of AppConfig', async (t) => {
  const store = createStore(t, '', '', 'AGE-SECRET-KEY-OLD')
  assert.equal(await store.ageApi.getGistAgeIdentity(), 'AGE-SECRET-KEY-OLD')
  assert.equal(store.legacyAge(), '')
  assert.doesNotMatch(
    readFileSync(path.join(path.dirname(store.path), 'gist-age-identity.json'), 'utf8'),
    /AGE-SECRET-KEY-OLD/
  )
  assert.equal(await store.ageApi.generateAndSaveGistAgeIdentity(), 'age1new')
  assert.equal(store.recipient(), 'age1new')
  assert.equal(await store.ageApi.getGistAgeIdentity(), 'AGE-SECRET-KEY-NEW')
  assert.equal(await store.ageApi.setGistAgeIdentity(''), 'age1new')
  assert.equal(await store.ageApi.isGistAgeIdentityConfigured(), false)
  assert.equal(store.recipient(), 'age1new')
})

test('failed Gist public-key config write restores the previous private key', async (t) => {
  const store = createStore(t, '', '', 'AGE-SECRET-KEY-OLD')
  await store.ageApi.getGistAgeIdentity()
  store.setFailPatch(true)
  await assert.rejects(store.ageApi.setGistAgeIdentity('AGE-SECRET-KEY-NEW'), /config write failed/)
  assert.equal(await store.ageApi.getGistAgeIdentity(), 'AGE-SECRET-KEY-OLD')
})

test('renderer AppConfig IPC excludes GitHub token from reads and patch results', () => {
  const ipc = readFileSync('src/main/utils/ipc.ts', 'utf8')
  assert.match(ipc, /getAppConfig', \(_e, force\) =>[\s\S]*?githubToken: _githubToken/)
  assert.match(ipc, /patchAppConfig', \(_e, config\) =>[\s\S]*?githubToken: _githubToken/)
  assert.match(ipc, /Object\.hasOwn\(patch, 'githubToken'\)/)
  assert.match(ipc, /Object\.hasOwn\(patch, 'webdavPassword'\)/)
  assert.match(ipc, /Object\.hasOwn\(patch, 'gistAgeIdentity'\)/)
  assert.match(ipc, /webdavPassword: _webdavPassword/)
  assert.match(ipc, /gistAgeIdentity: _gistAgeIdentity/)
  assert.match(
    readFileSync('src/main/index.ts', 'utf8'),
    /runStartupTask\('GitHub token migration', getGitHubToken\(\)\)/
  )
})
