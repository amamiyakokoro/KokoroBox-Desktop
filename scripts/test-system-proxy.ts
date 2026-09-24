import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PacHttpServer, localPacUrl } from '../src/main/resolve/pac-http-server'
import { shouldReapplyProxyForNetworkChange } from '../src/main/sys/sysproxy-network'
import { defaultSystemProxyBypass, normalizeProxyHost } from '../src/shared/system-proxy'
import { readSystemProxyEnabled } from '../src/shared/sysproxy-operation'
import ts from 'typescript'

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
