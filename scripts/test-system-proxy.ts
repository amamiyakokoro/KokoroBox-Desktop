import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { PacHttpServer, localPacUrl } from '../src/main/resolve/pac-http-server'
import { shouldReapplyProxyForNetworkChange } from '../src/main/sys/sysproxy-network'
import { defaultSystemProxyBypass, normalizeProxyHost } from '../src/shared/system-proxy'
import { readSystemProxyEnabled } from '../src/shared/sysproxy-operation'
import ts from 'typescript'

function loadWindowsModule<T>(name: string, dependencies: Record<string, unknown>): T {
  const source = ts.transpileModule(readFileSync(`src/main/sys/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'process', source)(
    (id: string) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`)
      return dependencies[id]
    },
    module,
    module.exports,
    { platform: 'win32' }
  )
  return module.exports as T
}

test('the Windows switch without Service applies manual and PAC proxy settings and releases them', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kokorobox-proxy-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const events: string[] = []
  type Settings = import('../src/shared/proxy-diagnostics-contract').NativeSystemProxySettings
  let system: Settings = { mode: 'disabled', bypass: [] }
  let serviceAvailable = false
  let mode: 'manual' | 'auto' = 'manual'
  let nativeWriteFails = false
  const native = {
    getNativeSystemProxyDiagnostics: async () => ({
      status: 'available',
      enabled: system.mode === 'manual',
      pac: { enabled: system.mode === 'auto', url: system.pacUrl },
      bypass: system.bypass,
      windows: { proxyServer: `${system.host}:${system.port}` }
    }),
    setNativeSystemProxy: async (settings: Settings) => {
      if (nativeWriteFails) throw new Error('Failed to write Windows proxy settings')
      events.push(settings.mode)
      system = settings
    }
  }
  const windowsProxy = loadWindowsModule<typeof import('../src/main/sys/windows-system-proxy')>(
    'windows-system-proxy',
    {
      'node:fs/promises': fs,
      'node:path': path,
      '../utils/dirs': { dataDir: () => directory },
      './native-system-proxy': native
    }
  )
  const app = loadWindowsModule<typeof import('../src/main/sys/sysproxy')>('sysproxy', {
    './native-system-proxy': native,
    './windows-system-proxy': windowsProxy,
    '../service/api': {
      getProxyStatus: async (readOnly: boolean) => {
        assert.equal(readOnly, true)
        if (!serviceAvailable) throw new Error('connect ENOENT')
      },
      isServiceUnavailableError: (error: Error) => error.message === 'connect ENOENT',
      stopServiceSysproxyEventStream: () => {},
      setProxy: () => assert.fail('Unexpected Service proxy mutation'),
      setPac: () => assert.fail('Unexpected Service PAC mutation'),
      disableProxy: () => assert.fail('Unexpected Service cleanup')
    },
    '../../shared/i18n': { tr: (value: string) => value },
    '../config': {
      getAppConfig: async () => ({ sysProxy: { mode, bypass: [] } }),
      getControledMihomoConfig: async () => ({ 'mixed-port': 7890 })
    },
    '../resolve/server': {
      startPacServer: async () => {
        events.push('start PAC')
        return 43210
      },
      stopPacServer: async () => {
        events.push('stop PAC')
      }
    },
    '../resolve/pac-http-server': { localPacUrl },
    '../../shared/system-proxy': { defaultSystemProxyBypass, normalizeProxyHost },
    electron: { net: { isOnline: () => true } },
    '../utils/log': {},
    '../utils/notification': {},
    './terminal-proxy': { disableTerminalProxy: async () => {} },
    './network-context': {},
    './sysproxy-network': {}
  })

  assert.equal(await app.triggerSysProxy(true, false), 'applied')
  assert.deepEqual(system, { mode: 'manual', host: '127.0.0.1', port: 7890, bypass: [] })
  assert.equal(await windowsProxy.readWindowsNativeProxyEnabled(), true)

  serviceAvailable = true
  mode = 'auto'
  nativeWriteFails = true
  await assert.rejects(app.triggerSysProxy(true, false), /Failed to write Windows proxy settings/)
  assert.equal(await windowsProxy.readWindowsNativeProxyEnabled(), true)
  nativeWriteFails = false
  await app.triggerSysProxy(true, false)
  assert.deepEqual(system, { mode: 'auto', pacUrl: localPacUrl(43210), bypass: [] })
  await app.triggerSysProxy(false, false)
  assert.deepEqual(events, [
    'manual',
    'stop PAC',
    'start PAC',
    'start PAC',
    'auto',
    'disabled',
    'stop PAC'
  ])
  assert.deepEqual(await windowsProxy.readWindowsNativeProxyOwnership(), [])

  serviceAvailable = false
  await app.triggerSysProxy(true, false)
  const externallyChanged = { mode: 'auto' as const, pacUrl: 'http://example.test/pac', bypass: [] }
  system = externallyChanged
  await app.triggerSysProxy(false, false)
  assert.deepEqual(system, externallyChanged)
  assert.deepEqual(await windowsProxy.readWindowsNativeProxyOwnership(), [])
})

function loadSysProxyOperation() {
  const events: { channel: string; value?: unknown }[] = []
  let persisted = false
  let canceledRetries = 0
  let saveError: Error | undefined
  let serviceStatus: Record<string, unknown> = {}
  let trigger: (
    enable: boolean,
    options: import('../src/main/sys/sysproxy').TriggerSysProxyOptions
  ) => Promise<import('../src/main/sys/sysproxy').TriggerSysProxyResult> = async () => 'applied'
  const source = ts.transpileModule(readFileSync('src/main/sys/sysproxy-operation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const dependencies: Record<string, unknown> = {
    electron: {
      BrowserWindow: { getAllWindows: () => [] },
      ipcMain: { emit: (channel: string) => events.push({ channel }) }
    },
    '../config': {
      patchAppConfig: async (patch: { sysProxy: { enable: boolean } }) => {
        if (saveError) throw saveError
        persisted = patch.sysProxy.enable
      }
    },
    '../service/api': { getProxyStatus: async () => serviceStatus },
    '../utils/log': { appendAppLog: async () => {} },
    '../utils/notification': { showNotification: async () => {} },
    './windows-system-proxy': { readWindowsNativeProxyEnabled: async () => null },
    '../../shared/i18n': { tr: (value: string) => value },
    '../../shared/sysproxy-operation': { readSystemProxyEnabled },
    './sysproxy': {
      cancelPendingSysProxyRetry: () => {
        canceledRetries++
      },
      triggerSysProxy: (
        enable: boolean,
        _onlyActiveDevice: boolean,
        _useRegistry: boolean,
        options: import('../src/main/sys/sysproxy').TriggerSysProxyOptions
      ) => trigger(enable, options)
    }
  }
  const module = { exports: {} as typeof import('../src/main/sys/sysproxy-operation') }
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
    events,
    canceledRetries: () => canceledRetries,
    persisted: () => persisted,
    setSaveError: (error?: Error) => {
      saveError = error
    },
    setServiceStatus: (status: Record<string, unknown>) => {
      serviceStatus = status
    },
    setTrigger: (next: typeof trigger) => {
      trigger = next
    }
  }
}

test('system proxy status only accepts explicit service booleans', () => {
  assert.equal(readSystemProxyEnabled({ enabled: true }), true)
  assert.equal(readSystemProxyEnabled({ active: false }), false)
  assert.equal(readSystemProxyEnabled({ enabled: 'true' }), null)
})

test('offline enable stays waiting and a disable cancels stale retry results', async () => {
  const operation = loadSysProxyOperation()
  let retryResult: ((result: 'applied' | 'waiting-network') => void) | undefined
  operation.setTrigger(async (enable, options) => {
    if (enable) {
      retryResult = options.onRetryResult
      return 'waiting-network'
    }
    options.onSystemApplied?.()
    return 'applied'
  })
  const enabling = operation.api.changeSysProxy(true, false)
  assert.equal(operation.api.getSysProxyOperationState().phase, 'enabling')
  assert.equal((await enabling).phase, 'waiting-network')
  assert.equal(operation.persisted(), true)
  const disabling = operation.api.changeSysProxy(false, false)
  assert.equal(operation.canceledRetries(), 1)
  assert.equal(operation.api.getSysProxyOperationState().phase, 'disabling')
  assert.deepEqual((({ phase, confirmed }) => ({ phase, confirmed }))(await disabling), {
    phase: 'idle',
    confirmed: false
  })
  retryResult?.('applied')
  assert.equal(operation.api.getSysProxyOperationState().confirmed, false)
  assert.equal(operation.persisted(), false)
  assert.ok(operation.events.some(({ channel }) => channel === 'updateTrayMenu'))
})

test('definite application failure retains the last confirmed state', async () => {
  const operation = loadSysProxyOperation()
  operation.setTrigger(async () => {
    throw new Error('service refused the change')
  })
  await assert.rejects(operation.api.changeSysProxy(true, false), /service refused/)
  assert.equal(operation.api.getSysProxyOperationState().phase, 'idle')
  assert.equal(operation.api.getSysProxyOperationState().confirmed, null)
  assert.equal(operation.persisted(), false)
})

test('a save failure preserves the confirmed system result', async () => {
  const operation = loadSysProxyOperation()
  operation.setTrigger(async (_enable, options) => {
    options.onSystemApplied?.()
    return 'applied'
  })
  operation.setSaveError(new Error('disk full'))
  await assert.rejects(operation.api.changeSysProxy(true, false), /disk full/)
  assert.equal(operation.api.getSysProxyOperationState().phase, 'idle')
  assert.equal(operation.api.getSysProxyOperationState().confirmed, true)
  assert.equal(operation.persisted(), false)
})

test('an offline save failure cancels its pending retry', async () => {
  const operation = loadSysProxyOperation()
  operation.setTrigger(async () => 'waiting-network')
  operation.setSaveError(new Error('disk full'))
  await assert.rejects(operation.api.changeSysProxy(true, false), /disk full/)
  assert.equal(operation.canceledRetries(), 1)
  assert.equal(operation.api.getSysProxyOperationState().phase, 'idle')
  assert.equal(operation.persisted(), false)
})

test('timeout queries the service and keeps unknown outcomes unconfirmed', async () => {
  const operation = loadSysProxyOperation()
  operation.setTrigger(async () => {
    throw new Error('timeout of 15000ms exceeded')
  })
  operation.setServiceStatus({ enabled: true })
  const confirmed = await operation.api.changeSysProxy(true, false)
  assert.equal(confirmed.phase, 'idle')
  assert.equal(confirmed.confirmed, true)
  assert.equal(operation.persisted(), true)

  operation.setServiceStatus({ status: 'unknown' })
  const unknown = await operation.api.changeSysProxy(false, false)
  assert.equal(unknown.phase, 'unconfirmed')
  assert.equal(unknown.confirmed, null)
})

test('system proxy is reapplied for connection changes but not unrelated context updates', () => {
  const wifi = {
    online: true,
    defaultInterface: 'en0',
    defaultService: 'Wi-Fi',
    ssid: 'Home'
  }
  assert.equal(shouldReapplyProxyForNetworkChange(wifi, { ...wifi }), false)
  assert.equal(shouldReapplyProxyForNetworkChange(wifi, { ...wifi, ssid: 'Office' }), true)
  assert.equal(shouldReapplyProxyForNetworkChange(wifi, { ...wifi, defaultInterface: 'en1' }), true)
  assert.equal(
    shouldReapplyProxyForNetworkChange(wifi, { ...wifi, defaultService: 'Ethernet' }),
    true
  )
  assert.equal(shouldReapplyProxyForNetworkChange(wifi, { ...wifi, online: false }), false)
  assert.equal(shouldReapplyProxyForNetworkChange({ ...wifi, online: false }, wifi), true)
})

test('network recovery runs independently of offline core detection and stops on exit', () => {
  const startup = readFileSync('src/main/utils/init.ts', 'utf8')
  const lifecycle = readFileSync('src/main/resolve/appLifecycle.ts', 'utf8')
  const sysproxy = readFileSync('src/main/sys/sysproxy.ts', 'utf8')
  assert.match(startup, /startSysproxyNetworkRecovery\(\)\s*\n\s*if \(networkDetection\)/)
  assert.match(lifecycle, /stopSysproxyNetworkRecovery\(\)/)
  assert.match(sysproxy, /proxyRequest !== triggerSysProxyRequest/)
  assert.match(sysproxy, /!sysProxy\.enable/)
  assert.match(sysproxy, /getServiceMeta\(\)\)\.capabilities\.sysproxyNetworkReconcile/)
  assert.match(sysproxy, /An unavailable or older Service still needs the Desktop fallback/)
})

test('PAC listener is loopback-only, reuses an unchanged script, and closes before returning', async (t) => {
  const server = new PacHttpServer()
  t.after(() => server.stop())

  const port = await server.start('function FindProxyForURL() { return "DIRECT"; }')
  const url = localPacUrl(port)
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/pac$/)
  assert.match(await (await fetch(url)).text(), /DIRECT/)
  assert.equal(await server.start('function FindProxyForURL() { return "DIRECT"; }'), port)
  assert.equal((await fetch(`http://127.0.0.1:${port}/other`)).status, 404)

  await server.stop()
  await assert.rejects(fetch(url))

  const nextPort = await server.start(
    'function FindProxyForURL() { return "PROXY 127.0.0.1:7890"; }'
  )
  assert.match(await (await fetch(localPacUrl(nextPort))).text(), /PROXY 127\.0\.0\.1:7890/)
})

test('PAC start and stop requests serialize without leaving a listener', async () => {
  const server = new PacHttpServer()
  const start = server.start('DIRECT')
  const stop = server.stop()
  const port = await start
  await stop
  await assert.rejects(fetch(localPacUrl(port)))
})

test('proxy host validation accepts hosts and rejects URLs, ports, and control characters', () => {
  assert.equal(normalizeProxyHost(''), '127.0.0.1')
  assert.equal(normalizeProxyHost(' EXAMPLE.com '), 'example.com')
  assert.equal(normalizeProxyHost('::1'), '[::1]')
  for (const invalid of [
    'https://example.com',
    'example.com:8080',
    'example.com/path',
    'bad\nhost'
  ]) {
    assert.throws(() => normalizeProxyHost(invalid), /Invalid proxy host/)
  }
})

test('all platforms receive independent copies of the same default bypass values', () => {
  assert.deepEqual(defaultSystemProxyBypass('linux').slice(0, 2), ['localhost', '.local'])
  assert.ok(defaultSystemProxyBypass('darwin').includes('*.local'))
  assert.ok(defaultSystemProxyBypass('win32').includes('172.31.*'))
  const first = defaultSystemProxyBypass('win32')
  first.push('modified')
  assert.equal(defaultSystemProxyBypass('win32').includes('modified'), false)
})

test('native diagnostic remediation uses the operation queue and preserves confirmed state after a save error', async () => {
  const operation = loadSysProxyOperation()
  operation.setTrigger(async () => {
    throw new Error('must not apply through legacy setter')
  })
  operation.setSaveError(new Error('save failed'))
  let applied = false
  await assert.rejects(
    operation.api.changeSysProxy(true, false, async () => {
      applied = true
      return 'applied'
    }),
    /save failed/
  )
  assert.equal(applied, true)
  assert.equal(operation.api.getSysProxyOperationState().confirmed, true)
  assert.equal(operation.persisted(), false)
})
