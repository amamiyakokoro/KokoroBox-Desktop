import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import {
  resolveCoreHookDirectory,
  resolveCoreHookTouchCommand,
  resolveCoreStartupMode
} from '../src/main/core/coreHookPath'

test('Windows core startup hooks stay in the writable user-data directory', () => {
  assert.equal(
    resolveCoreHookDirectory('win32', 'C:\\Users\\user\\AppData\\Roaming\\KokoroBox'),
    'C:\\Users\\user\\AppData\\Roaming\\KokoroBox\\core-hooks'
  )
})

test('non-Windows core startup hooks remain under the active user-data directory', () => {
  assert.equal(
    resolveCoreHookDirectory('darwin', '/Users/user/Library/Application Support/KokoroBox'),
    '/Users/user/Library/Application Support/KokoroBox/core-hooks'
  )
})

test('Windows post-up command quotes paths containing spaces', () => {
  assert.equal(
    resolveCoreHookTouchCommand(
      'win32',
      'C:\\Users\\Example User\\AppData\\Roaming\\KokoroBox\\core-hooks\\startup.up'
    ),
    'type nul > "C:\\Users\\Example User\\AppData\\Roaming\\KokoroBox\\core-hooks\\startup.up"'
  )
})

test('Windows uses log readiness instead of a fatal shell post-up hook', () => {
  assert.equal(resolveCoreStartupMode('win32', 'post-up'), 'log')
  assert.equal(resolveCoreStartupMode('win32', 'log'), 'log')
  assert.equal(resolveCoreStartupMode('darwin', 'post-up'), 'post-up')
  assert.equal(resolveCoreStartupMode('linux', 'log'), 'log')
})

test('direct Mihomo processes cannot create a visible Windows console', () => {
  const managerSource = readFileSync('src/main/core/manager.ts', 'utf8')
  assert.match(
    managerSource,
    /spawn\(corePath, spawnArgs,[\s\S]*windowsHide: process\.platform === 'win32'/
  )
})

test('Windows TUN checks elevation and follows the running core state after a restart', async () => {
  const source = ts.createSourceFile(
    'manager.ts',
    readFileSync('src/main/core/manager.ts', 'utf8'),
    ts.ScriptTarget.Latest
  )
  const functions = source.statements
    .filter(ts.isFunctionDeclaration)
    .filter((node) => ['setTunEnabled', 'reconcileTunStartup'].includes(node.name?.text ?? ''))
  assert.equal(functions.length, 2)
  const { outputText } = ts.transpileModule(
    functions.map((node) => node.getText(source)).join('\n'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  )

  let admin = false
  let runtimeTun = false
  let restartFailure: Error | undefined
  const config = { tun: { enable: false }, dns: { enable: false } }
  const events: string[] = []
  const dependencies = {
    process: { platform: 'win32' },
    isRunningAsAdmin: () => admin,
    getAppConfig: async () => ({ corePermissionMode: 'elevated' }),
    getControledMihomoConfig: async () => structuredClone(config),
    patchControledMihomoConfig: async (patch: Partial<typeof config>) => {
      assert.ok(patch.tun)
      config.tun.enable = patch.tun.enable
      if (patch.dns) config.dns.enable = patch.dns.enable
      events.push(`persist:${config.tun.enable}`)
    },
    mihomoConfig: async () => ({ tun: { enable: runtimeTun } }),
    restartCore: async () => {
      if (restartFailure) throw restartFailure
      if (config.tun.enable) {
        await controller.reconcileTunStartup(
          'level=error msg="Start TUN listening error: configure tun interface: Access is denied."'
        )
      }
    },
    recoverDNS: async () => {
      events.push('recover DNS')
    },
    publishTunConfig: () => events.push(`publish:${config.tun.enable}`),
    showNotification: ({ body }: { body: string }) => events.push(body),
    tr: (value: string) => value
  }
  const controller = new Function(
    'dependencies',
    'exports',
    `const { ${Object.keys(dependencies).join(', ')} } = dependencies;
    let tunChangeTask = Promise.resolve();
    ${outputText}
    return { setTunEnabled, reconcileTunStartup };`
  )(dependencies, {}) as {
    setTunEnabled: (enabled: boolean) => Promise<boolean>
    reconcileTunStartup: (startupOutput: string) => Promise<void>
  }

  await assert.rejects(controller.setTunEnabled(true), /Run as administrator/)
  assert.deepEqual(events, [])

  admin = true
  restartFailure = new Error('core exited')
  await assert.rejects(controller.setTunEnabled(true), /core exited/)
  assert.deepEqual(config, { tun: { enable: false }, dns: { enable: false } })
  assert.deepEqual(events.splice(0), ['persist:true', 'persist:false', 'publish:false'])

  restartFailure = undefined
  assert.equal(await controller.setTunEnabled(true), false)
  assert.deepEqual(events.splice(0), [
    'persist:true',
    'persist:false',
    'recover DNS',
    'publish:false',
    'configure tun interface: Access is denied.',
    'publish:false'
  ])

  runtimeTun = true
  restartFailure = new Error('log level update failed')
  await assert.rejects(controller.setTunEnabled(true), /log level update failed/)
  assert.equal(config.tun.enable, true)
  assert.deepEqual(events.splice(0), ['persist:true', 'publish:true'])

  restartFailure = undefined
  assert.equal(await controller.setTunEnabled(false), false)
  assert.equal(await controller.setTunEnabled(true), true)
  assert.equal(await controller.setTunEnabled(false), false)
  assert.deepEqual(events, [
    'persist:false',
    'publish:false',
    'persist:true',
    'publish:true',
    'persist:false',
    'publish:false'
  ])
})
