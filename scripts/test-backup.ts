import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync
} from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { test, type TestContext } from 'node:test'
import AdmZip from 'adm-zip'
import dayjs from 'dayjs'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'
import * as archives from '../src/main/resolve/backup-archive'
import { defaultAppRoutingConfig } from '../src/shared/app-routing'
import { parseYaml } from '../src/main/utils/yaml'
import { tr } from '../src/shared/i18n'

function fixture(t: TestContext): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-backup-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  write(directory, 'config.yaml', 'language: en\nsysProxy:\n  enable: false\n')
  write(directory, 'mihomo.yaml', 'mixed-port: 7890\n')
  write(directory, 'profile.yaml', 'items: []\n')
  write(directory, 'override.yaml', 'items: []\n')
  return directory
}
function write(directory: string, name: string, content: string): void {
  const file = path.join(directory, name)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}
function read(directory: string, name: string): string {
  return readFileSync(path.join(directory, name), 'utf8')
}
function snapshot(directory: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${name}/`)
      else files[name] = read(directory, name)
    }
  }
  walk(directory, '')
  return files
}

test('ZIP round trip restores managed data and replaces stale files without changing device credentials', (t) => {
  const source = fixture(t)
  write(source, 'profiles/test.yaml', 'proxies: []')
  write(source, 'override/test.js', 'function main(config) { return config }')
  write(source, 'app-routing/config.json', JSON.stringify(defaultAppRoutingConfig))
  write(source, 'app-routing/icons/app.png', 'icon')
  write(source, 'backgrounds/image.png', 'home image')
  write(source, 'network-card-backgrounds/image.png', 'network image')
  mkdirSync(path.join(source, 'profiles/empty'))
  const archive = archives.createBackupArchive(source)
  const target = fixture(t)
  write(target, 'profiles/stale.yaml', 'stale')
  write(target, 'config.yaml.backup', 'old recovery')
  write(target, 'app-routing/config.json.backup', 'old routing recovery')
  write(target, 'service-auth.json', 'device auth')
  write(target, 'kokoro-auth.json', 'account session')
  write(target, 'webdav-password.json', 'encrypted password')
  archives.restoreBackupArchive(target, archive)
  for (const [name, content] of Object.entries(snapshot(source)))
    assert.equal(read(target, name), content)
  assert.equal(existsSync(path.join(target, 'profiles/stale.yaml')), false)
  assert.equal(existsSync(path.join(target, 'profiles/empty')), true)
  assert.equal(read(target, 'config.yaml.backup'), read(target, 'config.yaml'))
  assert.equal(
    read(target, 'app-routing/config.json.backup'),
    read(target, 'app-routing/config.json')
  )
  assert.equal(read(target, 'service-auth.json'), 'device auth')
  assert.equal(read(target, 'kokoro-auth.json'), 'account session')
  assert.equal(read(target, 'webdav-password.json'), 'encrypted password')
})

test('old WebDAV ZIPs remain usable and leave absent optional data unchanged', (t) => {
  const source = fixture(t)
  const legacy = new AdmZip()
  for (const name of ['config.yaml', 'mihomo.yaml', 'profile.yaml', 'override.yaml'])
    legacy.addLocalFile(path.join(source, name))
  const target = fixture(t)
  write(target, 'app-routing/config.json', 'existing rules')
  write(target, 'backgrounds/existing.png', 'existing image')
  archives.restoreBackupArchive(target, legacy.toBuffer())
  assert.equal(read(target, 'app-routing/config.json'), 'existing rules')
  assert.equal(read(target, 'backgrounds/existing.png'), 'existing image')
})

test('backup excludes runtime files and plaintext legacy app credentials on export and import', (t) => {
  const source = fixture(t)
  write(
    source,
    'config.yaml',
    'sysProxy: {}\ngithubToken: secret-token\nwebdavPassword: secret-password\ngistAgeIdentity: secret-key\n'
  )
  for (const name of [
    'service-auth.json',
    'service-identity.native',
    'kokoro-auth.json',
    'github-token.json',
    'webdav-password.json',
    'gist-age-identity.json',
    'logs/service.log',
    'override/test.log'
  ])
    write(source, name, 'sensitive')
  const zip = new AdmZip(archives.createBackupArchive(source))
  assert.deepEqual(
    zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.entryName)
      .sort(),
    ['config.yaml', 'mihomo.yaml', 'override.yaml', 'profile.yaml']
  )
  assert.doesNotMatch(zip.readAsText('config.yaml'), /secret-/)
  // A pre-migration archive may still contain these keys.
  zip.updateFile('config.yaml', Buffer.from(read(source, 'config.yaml')))
  const target = fixture(t)
  archives.restoreBackupArchive(target, zip.toBuffer())
  assert.deepEqual(parseYaml(read(target, 'config.yaml')), { sysProxy: {} })
})

test('pending restore waits for restart and wins over writes from the closing instance', (t) => {
  const source = fixture(t)
  const target = fixture(t)
  write(source, 'mihomo.yaml', 'mixed-port: 9999\n')
  archives.stageBackupRestore(target, archives.createBackupArchive(source))
  assert.equal(read(target, 'mihomo.yaml'), 'mixed-port: 7890\n')
  write(target, 'mihomo.yaml', 'mixed-port: 8888\n')
  assert.equal(archives.applyPendingBackupRestore(target), true)
  assert.equal(read(target, 'mihomo.yaml'), 'mixed-port: 9999\n')
  assert.equal(archives.applyPendingBackupRestore(target), false)
})

test('invalid configuration and non-backup ZIPs are rejected before touching any existing file', (t) => {
  const directory = fixture(t)
  const before = snapshot(directory)
  for (const [name, content] of [
    ['config.yaml', 'sysProxy: []'],
    ['mihomo.yaml', '[]'],
    ['profile.yaml', 'items: invalid'],
    ['override.yaml', 'items: invalid'],
    ['app-routing/config.json', '{}']
  ]) {
    const zip = new AdmZip(archives.createBackupArchive(directory))
    zip.addFile(name, Buffer.from(content))
    assert.throws(() => archives.restoreBackupArchive(directory, zip.toBuffer()))
    assert.deepEqual(snapshot(directory), before)
  }
  assert.throws(() => archives.restoreBackupArchive(directory, new AdmZip().toBuffer()), /missing/)
  assert.throws(() => archives.stageBackupRestore(directory, Buffer.from('not a ZIP')))
  assert.deepEqual(snapshot(directory), before)
})

test('unapproved files, unsafe Windows paths, symlinks and case collisions cannot be restored', (t) => {
  const directory = fixture(t)
  const before = snapshot(directory)
  for (const name of [
    'service-auth.json',
    'profiles/C:evil.yaml',
    'profiles/CON.yaml',
    'profiles/space .yaml.',
    'CONFIG.yaml'
  ]) {
    const zip = new AdmZip(archives.createBackupArchive(directory))
    zip.addFile(name, Buffer.from('unsafe'))
    assert.throws(() => archives.restoreBackupArchive(directory, zip.toBuffer()))
    assert.deepEqual(snapshot(directory), before)
  }
  const zip = new AdmZip(archives.createBackupArchive(directory))
  const link = zip.addFile('profiles/link', Buffer.from('target'))
  link.attr = (0xa1ff << 16) >>> 0
  assert.throws(() => archives.validateBackupArchive(zip.toBuffer()), /symbolic link/)
})

test('path traversal in raw ZIP metadata is rejected', (t) => {
  const directory = fixture(t)
  const zip = new AdmZip(archives.createBackupArchive(directory))
  zip.addFile('profiles/aa/x.yaml', Buffer.from('unsafe'))
  const buffer = zip.toBuffer()
  // addFile normalizes traversal. Alter both headers to exercise imported raw metadata.
  const unsafe = Buffer.from(
    buffer.toString('latin1').replaceAll('profiles/aa/x.yaml', 'profiles/../x.yaml'),
    'latin1'
  )
  assert.throws(() => archives.validateBackupArchive(unsafe), /Invalid backup path/)
  const backslash = Buffer.from(
    buffer.toString('latin1').replaceAll('profiles/aa/x.yaml', 'profiles/aa\\x.yaml'),
    'latin1'
  )
  assert.throws(() => archives.validateBackupArchive(backslash), /Invalid backup path/)
})

test('write failure rolls back every replaced file and directory', (t) => {
  const source = fixture(t)
  write(source, 'profiles/new.yaml', 'new')
  write(source, 'mihomo.yaml', 'mixed-port: 9999')
  const target = fixture(t)
  write(target, 'profiles/old.yaml', 'old')
  const before = snapshot(target)
  let failed = false
  assert.throws(
    () =>
      archives.restoreBackupArchive(target, archives.createBackupArchive(source), (from, to) => {
        if (!failed && from.toString().includes(`${path.sep}new${path.sep}profile.yaml`)) {
          failed = true
          throw new Error('simulated disk failure')
        }
        renameSync(from, to)
      }),
    /simulated disk failure/
  )
  assert.equal(failed, true)
  assert.deepEqual(snapshot(target), before)
})

test('unreasonably large declared file sizes are rejected without allocation or data changes', (t) => {
  const directory = fixture(t)
  const before = snapshot(directory)
  const buffer = archives.createBackupArchive(directory)
  const central = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  assert.notEqual(central, -1)
  buffer.writeUInt32LE(256 * 1024 * 1024 + 1, central + 24)
  assert.throws(() => archives.restoreBackupArchive(directory, buffer), /size limit/)
  assert.deepEqual(snapshot(directory), before)
})

function backupApi(t: TestContext) {
  const directory = fixture(t)
  const archiveFile = path.join(directory, 'chosen-backup.zip')
  let cancelled = false
  let confirmed = false
  let confirmCalls = 0
  let restartCalls = 0
  let uploadResult = true
  const events: string[] = []
  const client = {
    exists: async () => true,
    createDirectory: async () => {},
    putFileContents: async (_name: string, buffer: Buffer) => {
      archives.validateBackupArchive(buffer)
      return uploadResult
    },
    getFileContents: async () => readFileSync(archiveFile),
    getDirectoryContents: async () => [],
    deleteFile: async () => {}
  }
  const dependencies: Record<string, unknown> = {
    '../config': {
      getAppConfig: async () => ({ webdavUrl: 'https://example.com', webdavDir: 'KokoroBox' })
    },
    '../config/webdav-password': { getWebdavPassword: async () => 'password' },
    dayjs,
    electron: {
      BrowserWindow: { getFocusedWindow: () => null },
      dialog: {
        showSaveDialog: async () => ({ canceled: cancelled, filePath: archiveFile }),
        showOpenDialog: async () => ({ canceled: cancelled, filePaths: [archiveFile] }),
        showMessageBox: async () => {
          confirmCalls++
          return { response: confirmed ? 1 : 0 }
        }
      },
      app: {
        relaunch: () => {
          restartCalls++
          events.push('relaunch')
        },
        quit: () => events.push('quit')
      }
    },
    'node:fs/promises': fsPromises,
    'node:crypto': { randomUUID },
    'node:path': path,
    '../utils/dirs': { dataDir: () => directory },
    '../../shared/i18n': { tr },
    './backup-archive': {
      ...archives,
      stageBackupRestore: (dir: string, buffer: Buffer) => {
        archives.stageBackupRestore(dir, buffer)
        events.push('staged')
      }
    },
    './appLifecycle': { setNotQuitDialog: () => events.push('skip-quit-confirm') },
    'webdav/dist/node/index.js': { createClient: () => client }
  }
  const source = ts.transpileModule(readFileSync('src/main/resolve/backup.ts', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} as typeof import('../src/main/resolve/backup') }
  new Function('require', 'module', 'exports', source)(
    (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), name)
      return dependencies[name]
    },
    module,
    module.exports
  )
  return {
    api: module.exports,
    directory,
    archiveFile,
    events,
    confirmCalls: () => confirmCalls,
    restartCalls: () => restartCalls,
    cancel: (value: boolean) => {
      cancelled = value
    },
    confirm: () => {
      confirmed = true
    },
    failUpload: () => {
      uploadResult = false
    }
  }
}

test('local export cancellation leaves files alone; successful export produces a usable ZIP', async (t) => {
  const state = backupApi(t)
  const before = snapshot(state.directory)
  state.cancel(true)
  assert.equal(await state.api.localBackup(), false)
  assert.deepEqual(snapshot(state.directory), before)
  state.cancel(false)
  assert.equal(await state.api.localBackup(), true)
  archives.validateBackupArchive(readFileSync(state.archiveFile))
  assert.equal(
    readdirSync(state.directory).some((name) => name.endsWith('.tmp')),
    false
  )
})

test('local restore validates before confirmation and restarts only after a confirmed archive is staged', async (t) => {
  const state = backupApi(t)
  state.cancel(true)
  assert.equal(await state.api.localRestore(), false)
  assert.equal(state.confirmCalls(), 0)
  state.cancel(false)
  writeFileSync(state.archiveFile, 'invalid')
  await assert.rejects(state.api.localRestore())
  assert.equal(state.confirmCalls(), 0)
  await state.api.localBackup()
  assert.equal(await state.api.localRestore(), false)
  assert.equal(state.restartCalls(), 0)
  state.confirm()
  assert.equal(await state.api.localRestore(), true)
  assert.deepEqual(state.events, ['staged', 'skip-quit-confirm', 'relaunch', 'quit'])
  assert.equal(archives.applyPendingBackupRestore(state.directory), true)
})

test('WebDAV restore shares confirmation and staging; a rejected upload cannot report success', async (t) => {
  const state = backupApi(t)
  await state.api.localBackup()
  assert.equal(await state.api.webdavRestore('backup.zip'), false)
  assert.equal(state.restartCalls(), 0)
  state.confirm()
  assert.equal(await state.api.webdavRestore('backup.zip'), true)
  assert.deepEqual(state.events, ['staged', 'skip-quit-confirm', 'relaunch', 'quit'])
  state.failUpload()
  await assert.rejects(state.api.webdavBackup(), /Backup upload failed/)
  await assert.rejects(state.api.webdavRestore('../escape.zip'), /Invalid backup filename/)
})
