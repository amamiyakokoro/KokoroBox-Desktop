import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import ts from 'typescript'
import { launchDetachedProcess } from '../src/main/resolve/detached-process'

function fixture() {
  const calls: string[] = []
  const child = new EventEmitter() as ChildProcess
  child.unref = () => {
    calls.push('unref')
  }
  const spawnProcess = (() => child) as typeof spawn
  const bytes = Buffer.from('installer fixture')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const file = 'kokorobox-desktop-windows-4.26.10-4-x64-setup.exe'
  const source = ts.createSourceFile(
    'autoUpdater.ts',
    readFileSync('src/main/resolve/autoUpdater.ts', 'utf8'),
    ts.ScriptTarget.ES2022,
    true
  )
  const node = source.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'downloadAndInstallUpdate'
  )!
  const code = ts.transpileModule(node.getText(source), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const deps = {
    resolveReleaseTag: (version: string) => version,
    process: { platform: 'win32', arch: 'x64' },
    getControledMihomoConfig: async () => ({ 'mixed-port': 0 }),
    getGitHubToken: async () => '',
    isPortable: () => false,
    downloadCancelToken: null,
    getGitHubAuthHeaders: () => ({}),
    axios: {
      CancelToken: { source: () => ({ token: {} }) },
      get: async () => ({ data: { assets: [{ name: file, digest: `sha256:${hash}` }] } }),
      isCancel: () => false
    },
    mainWindow: { webContents: { send: () => {} } },
    existsSync: () => true,
    path,
    dataDir: () => '/fixture',
    readFile: async () => bytes,
    createHash,
    ensureWindowsInstallerTempSpace: async () => {},
    triggerSysProxy: async (enabled: boolean) => {
      calls.push(`proxy:${enabled}`)
    },
    pauseServiceFallbackForAppUpdate: async () => {
      calls.push('pause')
    },
    clearAppUpdateServiceFallbackPause: async () => {
      calls.push('resume')
    },
    launchDetachedProcess: async (file: string, args: string[]) => {
      calls.push('launch')
      await launchDetachedProcess(file, args, spawnProcess)
    },
    systemCoreOnlyBuild: false,
    setNotQuitDialog: () => {},
    app: {
      quit: () => {
        calls.push('quit')
      }
    },
    getAppConfig: async () => ({ sysProxy: { enable: true } }),
    appendAppLog: async () => {},
    rm: async () => {
      calls.push('delete')
    },
    tr: (message: string) => message
  }
  const run = new Function(
    ...Object.keys(deps),
    `const exports={};${code};return exports.downloadAndInstallUpdate;`
  )(...Object.values(deps)) as (version: string) => Promise<void>
  return { run: () => run('4.26.10-4'), calls, child }
}
async function tick() {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

test('installer launch waits for spawn before detaching or quitting', async () => {
  const f = fixture()
  const pending = f.run()
  await tick()
  assert.deepEqual(f.calls, ['proxy:false', 'pause', 'launch'])
  f.child.emit('spawn')
  await pending
  assert.deepEqual(f.calls, ['proxy:false', 'pause', 'launch', 'unref', 'quit'])
})

test('installer spawn failure restores proxy and fallback state without quitting', async () => {
  const f = fixture()
  const pending = f.run()
  await tick()
  const failure = new Error('permission denied')
  f.child.emit('error', failure)
  await assert.rejects(pending, (error) => error === failure)
  assert.deepEqual(f.calls, ['proxy:false', 'pause', 'launch', 'resume', 'proxy:true', 'delete'])
})

test('synchronous spawn failures are propagated', async () => {
  await assert.rejects(
    launchDetachedProcess('installer', [], (() => {
      throw new Error('invalid executable')
    }) as typeof spawn),
    /invalid executable/
  )
})
