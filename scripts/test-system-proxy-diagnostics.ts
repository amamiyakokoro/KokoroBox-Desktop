import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import { setLocale } from '../src/shared/i18n'
import { defaultSystemProxyBypass } from '../src/shared/system-proxy'
import { buildLinuxSystemProxyDiagnostics } from '../src/shared/linux-system-proxy-diagnostics'
import {
  buildSystemProxyDiagnostics,
  type SystemProxyDiagnosticInput
} from '../src/shared/system-proxy-diagnostics'

setLocale('en')

function input(patch: Partial<SystemProxyDiagnosticInput> = {}): SystemProxyDiagnosticInput {
  return {
    platform: 'win32',
    intentEnabled: true,
    mode: 'manual',
    expectedProxy: '127.0.0.1:8123',
    expectedPort: 8123,
    expectedBypass: defaultSystemProxyBypass('win32'),
    windowsProxy: {
      enabled: true,
      server: '127.0.0.1:8123',
      override: defaultSystemProxyBypass('win32').join(';'),
      pacUrl: ''
    },
    listenerAvailable: true,
    coreRunning: true,
    runtimePort: 8123,
    connectivity: { outcome: 'success' },
    loopbackExemptions: 0,
    winHttp: { mode: 'direct' },
    ...patch
  }
}

function check(patch: Partial<SystemProxyDiagnosticInput>, id: string) {
  const result = buildSystemProxyDiagnostics(input(patch))
  return { result, item: result.results.find((row) => row.id === id)! }
}

test('healthy Windows user proxy uses the current port and informational UWP/WinHTTP rows', () => {
  const result = buildSystemProxyDiagnostics(input())
  assert.equal(result.overall.status, 'success')
  assert.equal(result.overall.summary, 'System proxy is working normally')
  assert.deepEqual(result.state, {
    intentEnabled: true,
    enabled: true,
    matchesExpectedConfig: true,
    listenerAvailable: true,
    coreRunning: true,
    connectivityAvailable: true
  })
  assert.equal(result.results.find((row) => row.id === 'appcontainer')?.status, 'info')
  assert.equal(result.results.find((row) => row.id === 'winhttp')?.status, 'info')
  assert.match(result.report, /127\.0\.0\.1:8123/)
  assert.doesNotMatch(result.report, /7890/)
})

test('disabled intent is distinct from Windows disabled while UI intent is enabled', () => {
  const windowsProxy = { ...input().windowsProxy!, enabled: false }
  const disabled = check({ intentEnabled: false, windowsProxy }, 'system-proxy')
  assert.equal(disabled.result.overall.summary, 'System proxy is disabled')
  assert.equal(disabled.item.action, 'enable-system-proxy')
  const mismatch = check({ windowsProxy }, 'conflicts')
  assert.equal(mismatch.result.state.enabled, false)
  assert.equal(mismatch.result.state.intentEnabled, true)
  assert.equal(mismatch.item.summary, 'System proxy configuration was changed')
  assert.equal(mismatch.result.overall.kind, 'disabled')
})

test('wrong Windows proxy port shows real expected/current addresses with an explicit repair', () => {
  const { result, item } = check(
    { windowsProxy: { ...input().windowsProxy!, server: '127.0.0.1:10809' } },
    'proxy-address'
  )
  assert.equal(item.status, 'error')
  assert.equal(item.action, 'restore-system-proxy')
  assert.match(item.details!, /Expected: 127\.0\.0\.1:8123\nCurrent: 127\.0\.0\.1:10809/)
  assert.equal(result.overall.summary, 'System proxy configuration does not match KokoroBox')
  assert.equal(result.state.connectivityAvailable, true)
  assert.equal(result.state.matchesExpectedConfig, false)
})

test('core stopped, listener unavailable, loaded config failure and port mismatch stay separate', () => {
  const stopped = check(
    {
      coreRunning: false,
      runtimePort: undefined,
      listenerAvailable: false,
      connectivity: { outcome: 'unreachable' }
    },
    'core'
  )
  assert.equal(stopped.item.summary, 'Core not running')
  assert.equal(stopped.item.action, 'start-core')
  assert.equal(stopped.result.state.enabled, true)
  assert.equal(stopped.result.state.connectivityAvailable, false)
  assert.equal(stopped.result.overall.status, 'error')
  const noListener = check({ listenerAvailable: false }, 'listener')
  assert.equal(noListener.item.status, 'error')
  assert.equal(noListener.item.action, 'restart-core')
  assert.equal(
    noListener.result.overall.summary,
    'System proxy is enabled, but the local proxy is unavailable'
  )
  assert.equal(check({ runtimePort: undefined }, 'core-config').item.status, 'error')
  assert.equal(
    check({ runtimePort: 9000 }, 'core-config').item.summary,
    'System proxy port does not match the current core port'
  )
})

test('listening proxy is not healthy when outbound fails or listener disappears between probes', () => {
  const failed = check(
    { connectivity: { outcome: 'outbound-failed', reason: 'timeout' } },
    'connectivity'
  )
  assert.equal(failed.item.status, 'error')
  assert.equal(
    failed.result.overall.summary,
    'Proxy is reachable, but outbound connectivity failed'
  )
  assert.equal(failed.result.state.listenerAvailable, true)
  assert.equal(failed.result.state.connectivityAvailable, false)
  assert.equal(
    check(
      { connectivity: { outcome: 'unreachable', reason: 'connection-refused' } },
      'connectivity'
    ).item.summary,
    'Unable to connect to local proxy'
  )
})

test('unexpected PAC and broad bypass are warnings, normal <local> is accepted', () => {
  const pac = check(
    {
      windowsProxy: { ...input().windowsProxy!, pacUrl: 'https://private.example/pac?token=secret' }
    },
    'pac'
  )
  assert.equal(pac.item.status, 'warning')
  assert.equal(pac.item.action, 'restore-system-proxy')
  const bypass = check({ windowsProxy: { ...input().windowsProxy!, override: '*' } }, 'bypass')
  assert.equal(bypass.item.status, 'warning')
  assert.equal(bypass.result.overall.status, 'warning')
  assert.equal(
    check(
      {
        expectedBypass: ['<local>'],
        windowsProxy: { ...input().windowsProxy!, override: '<local>' }
      },
      'bypass'
    ).item.status,
    'success'
  )
})

test('expected PAC mode does not require ProxyEnable=1 or a manual ProxyServer', () => {
  const result = buildSystemProxyDiagnostics(
    input({
      mode: 'auto',
      expectedPacUrl: 'http://127.0.0.1:40231/pac',
      windowsProxy: {
        enabled: false,
        server: '',
        override: '',
        pacUrl: 'http://127.0.0.1:40231/pac'
      }
    })
  )
  assert.equal(result.overall.status, 'success')
  assert.equal(result.state.enabled, true)
  assert.equal(result.state.matchesExpectedConfig, true)
  assert.equal(
    result.results.find((row) => row.id === 'pac')?.summary,
    'KokoroBox PAC configuration active'
  )
  assert.equal(result.results.find((row) => row.id === 'proxy-address')?.status, 'info')
})

test('protocol-specific Windows proxy addresses require both HTTP and HTTPS to match', () => {
  assert.equal(
    check(
      {
        windowsProxy: {
          ...input().windowsProxy!,
          server: 'http=127.0.0.1:8123;https=127.0.0.1:8123'
        }
      },
      'proxy-address'
    ).item.status,
    'success'
  )
  assert.equal(
    check(
      {
        windowsProxy: {
          ...input().windowsProxy!,
          server: 'http=127.0.0.1:8123;https=127.0.0.1:9090'
        }
      },
      'proxy-address'
    ).item.status,
    'error'
  )
  assert.equal(
    check(
      { windowsProxy: { ...input().windowsProxy!, server: 'http=127.0.0.1:8123' } },
      'proxy-address'
    ).item.status,
    'error'
  )
})

test('unknown Windows reads and unsupported platforms never assert global system health', () => {
  assert.equal(
    buildSystemProxyDiagnostics(input({ windowsProxy: undefined })).overall.status,
    'error'
  )
  const result = buildSystemProxyDiagnostics(input({ platform: 'darwin', windowsProxy: undefined }))
  assert.equal(result.overall.status, 'info')
  assert.equal(result.state.enabled, null)
})

test('report, details and results omit credentials, arbitrary PAC URLs, custom bypass and WinHTTP values', () => {
  const result = buildSystemProxyDiagnostics(
    input({
      expectedProxy: 'my-private-node.example:8123',
      windowsProxy: {
        enabled: true,
        server: 'http=user:password@private.example:3128;https=user:password@private.example:3128',
        override: 'subscription.example?token=secret;<local>',
        pacUrl: 'https://user:password@pac.example/private?token=secret'
      },
      winHttp: { mode: 'proxy', server: 'user:password@private-winhttp.example:8080' }
    })
  )
  assert.doesNotMatch(
    JSON.stringify(result),
    /password|secret|subscription\.example|pac\.example|private-winhttp|my-private-node/
  )
  assert.match(result.report, /redacted/)
})

function load<T>(
  filename: string,
  overrides: Record<string, unknown>,
  platform = process.platform
): T {
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const require = createRequire(import.meta.url)
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'process', source)(
    (name: string) => (Object.hasOwn(overrides, name) ? overrides[name] : require(name)),
    module,
    module.exports,
    { ...process, platform }
  )
  return module.exports as T
}

test('unexpected enable while intent is disabled is a configuration conflict', () => {
  const { result, item } = check({ intentEnabled: false }, 'conflicts')
  assert.equal(item.status, 'warning')
  assert.equal(item.action, 'restore-system-proxy')
  assert.equal(result.overall.status, 'warning')
})

test('malformed or duplicated protocol entries do not falsely match the expected proxy', () => {
  for (const server of [
    'http=127.0.0.1:8123;https=127.0.0.1:8123;invalid value',
    '127.0.0.1:8123;127.0.0.1:8123'
  ]) {
    assert.equal(
      check({ windowsProxy: { ...input().windowsProxy!, server } }, 'proxy-address').item.status,
      'error'
    )
  }
})

function isolatedExport<T>(
  filename: string,
  name: string,
  dependencies: Record<string, unknown>
): T {
  const source = ts.createSourceFile(
    filename,
    readFileSync(filename, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )
  const statement = source.statements.find(
    (node) =>
      (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
      (ts.isVariableStatement(node) &&
        node.declarationList.declarations.some(
          (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name
        ))
  )
  assert.ok(statement)
  const compiled = ts.transpileModule(statement.getText(source), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports: Record<string, unknown> = {}
  new Function(...Object.keys(dependencies), 'exports', compiled)(
    ...Object.values(dependencies),
    exports
  )
  return exports[name] as T
}

test('read-only signed service failures preserve authentication but never trigger runtime recovery', async () => {
  let recoveries = 0
  let signers = 0
  const handlers: Array<(error: unknown) => Promise<never>> = []
  const factory = isolatedExport<typeof import('../src/main/service/api').createSignedServiceAxios>(
    'src/main/service/api.ts',
    'createSignedServiceAxios',
    {
      axios: {
        create: () => ({
          interceptors: {
            response: {
              use: (_success: unknown, error: (error: unknown) => Promise<never>) => {
                handlers.push(error)
              }
            }
          }
        })
      },
      serviceIpcPath: () => 'local-service-pipe',
      attachServiceAuth: () => {
        signers++
      },
      createServiceAPIError: () => new Error('normalized error'),
      handleServiceAxiosError: async () => {
        recoveries++
        throw new Error('runtime recovery')
      }
    }
  )
  factory('http://localhost/core/controller', false)
  await assert.rejects(handlers[0](new Error('service offline')), /normalized error/)
  assert.equal(recoveries, 0)
  assert.equal(signers, 1)
  factory()
  await assert.rejects(handlers[1](new Error('service offline')), /runtime recovery/)
  assert.equal(recoveries, 1)
  assert.equal(signers, 2)
})

test('read-only service status does not probe authenticated health or migrate service identity', async () => {
  let probes = 0
  let nativeState = 'running'
  const status = isolatedExport<typeof import('../src/main/service/manager').serviceStatus>(
    'src/main/service/manager.ts',
    'serviceStatus',
    {
      process: { platform: 'win32' },
      systemCoreOnlyBuild: true,
      servicePath: () => 'local-service.exe',
      native: { getWindowsServiceStatus: () => nativeState },
      probeServiceHealth: async () => {
        probes++
        return 'running'
      },
      ping: undefined,
      test: undefined,
      finalizeServiceAuthMigration: undefined,
      isServiceAuthenticationStateError: undefined
    }
  )
  assert.equal(await status(true), 'running')
  nativeState = 'unknown'
  assert.equal(await status(true), 'unknown')
  assert.equal(probes, 0)
  nativeState = 'running'
  assert.equal(await status(), 'running')
  assert.equal(probes, 1)
})

function nativeSnapshot(
  patch: Partial<NativeSystemProxyDiagnostics> = {}
): NativeSystemProxyDiagnostics {
  return {
    platform: 'windows',
    status: 'available',
    enabled: true,
    proxies: {
      http: { host: '127.0.0.1', port: 18423 },
      https: { host: '127.0.0.1', port: 18423 }
    },
    pac: { enabled: false },
    bypass: defaultSystemProxyBypass('win32'),
    windows: {
      proxyServer: '127.0.0.1:18423',
      proxyOverride: defaultSystemProxyBypass('win32').join(';'),
      autoConfigUrl: '',
      winHttp: { status: 'available', mode: 'direct' },
      appContainer: { supported: true, status: 'available', loopbackExemptionCount: 0 }
    },
    ...patch
  }
}
function runtimeSnapshot(patch: Partial<ProxyRuntimeDiagnostics> = {}): ProxyRuntimeDiagnostics {
  return {
    core: { running: true, ready: true },
    proxy: { host: '127.0.0.1', port: 18423 },
    listener: { available: true },
    connectivity: { available: true, outcome: 'success' },
    ...patch
  }
}
function diagnosticEngine(overrides: Record<string, unknown> = {}) {
  return load<typeof import('../src/main/sys/system-proxy-diagnostics')>(
    'src/main/sys/system-proxy-diagnostics.ts',
    {
      '../core/manager': { migrateCoreToServiceForDiagnostics: async () => {} },
      '../config': {
        getAppConfig: async () => ({ sysProxy: { enable: true }, corePermissionMode: 'service' })
      },
      '../service/api': {
        getProxyRuntimeDiagnostics: async () => runtimeSnapshot(),
        startCore: async () => {},
        restartCore: async () => {}
      },
      '../resolve/server': { getActivePacUrl: () => undefined, startPacServer: async () => 34567 },
      '../resolve/pac-http-server': {
        localPacUrl: (port: number) => `http://127.0.0.1:${port}/pac`
      },
      '../utils/log': { appendAppLog: async () => {} },
      './sysproxy-operation': {
        changeSysProxy: async () => {
          throw new Error('unexpected mutation')
        }
      },
      './sysproxy': {
        applyNativeDiagnosticProxy: async () => {
          throw new Error('unexpected mutation')
        }
      },
      './native-system-proxy': { getNativeSystemProxyDiagnostics: async () => nativeSnapshot() },
      '../../shared/system-proxy': { defaultSystemProxyBypass },
      '../../shared/system-proxy-diagnostics': { buildSystemProxyDiagnostics },
      '../../shared/linux-system-proxy-diagnostics': { buildLinuxSystemProxyDiagnostics },
      ...overrides
    },
    'win32'
  )
}

test('structured Native/Service integration covers Windows health, conflicts and partial failures', () => {
  const { combineSystemProxyDiagnostics: combine } = diagnosticEngine()
  const base = {
    platform: 'win32',
    intentEnabled: true,
    mode: 'manual' as const,
    expectedBypass: defaultSystemProxyBypass('win32')
  }
  const cases: Array<{
    name: string
    native?: NativeSystemProxyDiagnostics
    runtime?: ProxyRuntimeDiagnostics
    kind: string
    intent?: boolean
  }> = [
    { name: 'healthy', native: nativeSnapshot(), runtime: runtimeSnapshot(), kind: 'healthy' },
    {
      name: 'disabled',
      native: nativeSnapshot({ enabled: false }),
      runtime: runtimeSnapshot(),
      kind: 'disabled',
      intent: false
    },
    {
      name: 'desired ON actual OFF',
      native: nativeSnapshot({ enabled: false }),
      runtime: runtimeSnapshot(),
      kind: 'disabled'
    },
    {
      name: 'wrong port',
      native: nativeSnapshot({
        windows: { ...nativeSnapshot().windows!, proxyServer: '127.0.0.1:18424' }
      }),
      runtime: runtimeSnapshot(),
      kind: 'configuration-mismatch'
    },
    {
      name: 'stopped',
      native: nativeSnapshot(),
      runtime: runtimeSnapshot({
        core: { running: false, ready: false },
        proxy: { host: '127.0.0.1', port: null }
      }),
      kind: 'core-unavailable'
    },
    {
      name: 'listener down',
      native: nativeSnapshot(),
      runtime: runtimeSnapshot({
        listener: { available: false, errorCode: 'connection-refused' },
        connectivity: { available: false, outcome: 'unreachable' }
      }),
      kind: 'listener-unavailable'
    },
    {
      name: 'outbound down',
      native: nativeSnapshot(),
      runtime: runtimeSnapshot({
        connectivity: { available: false, outcome: 'outbound-failed', errorCode: 'timeout' }
      }),
      kind: 'connectivity-failed'
    },
    {
      name: 'PAC warning',
      native: nativeSnapshot({
        windows: { ...nativeSnapshot().windows!, autoConfigUrl: 'https://private/pac?secret' }
      }),
      runtime: runtimeSnapshot(),
      kind: 'warning'
    },
    {
      name: 'broad bypass',
      native: nativeSnapshot({ windows: { ...nativeSnapshot().windows!, proxyOverride: '*' } }),
      runtime: runtimeSnapshot(),
      kind: 'warning'
    },
    {
      name: 'WinHTTP unavailable',
      native: nativeSnapshot({
        windows: {
          ...nativeSnapshot().windows!,
          winHttp: { status: 'unavailable', errorCode: 'winhttp-read-failed' }
        }
      }),
      runtime: runtimeSnapshot(),
      kind: 'healthy'
    },
    {
      name: 'AppContainer unavailable',
      native: nativeSnapshot({
        windows: {
          ...nativeSnapshot().windows!,
          appContainer: {
            supported: true,
            status: 'unavailable',
            errorCode: 'appcontainer-read-failed'
          }
        }
      }),
      runtime: runtimeSnapshot(),
      kind: 'healthy'
    },
    {
      name: 'native partially failed',
      native: nativeSnapshot({ status: 'unavailable', enabled: null }),
      runtime: runtimeSnapshot(),
      kind: 'configuration-unavailable'
    },
    { name: 'service failed', native: nativeSnapshot(), kind: 'core-unavailable' }
  ]
  for (const c of cases) {
    const result = combine({ ...base, intentEnabled: c.intent ?? true }, c.native, c.runtime)
    assert.equal(result.overall.kind, c.kind, c.name)
    assert.equal(
      result.state.enabled,
      c.native?.status === 'available' ? c.native.enabled : null,
      c.name
    )
    assert.equal(result.state.intentEnabled, c.intent ?? true, c.name)
    assert.equal(
      result.results.find((row) => row.id === 'connectivity')?.status,
      c.runtime?.connectivity.available ? 'success' : 'error',
      c.name
    )
    assert.doesNotMatch(result.report, /private|secret/)
    if (c.name === 'service failed') {
      assert.equal(result.results.find((row) => row.id === 'system-proxy')?.status, 'success')
      assert.equal(result.state.matchesExpectedConfig, null)
      assert.equal(result.results.find((row) => row.id === 'conflicts')?.status, 'info')
      assert.equal(result.results.find((row) => row.id === 'proxy-address')?.action, undefined)
    }
    if (c.name === 'native partially failed')
      assert.equal(result.results.find((row) => row.id === 'winhttp')?.status, 'info')
    if (c.name === 'WinHTTP unavailable')
      assert.equal(result.results.find((row) => row.id === 'winhttp')?.status, 'warning')
    if (c.name === 'AppContainer unavailable')
      assert.equal(result.results.find((row) => row.id === 'appcontainer')?.status, 'warning')
  }
})

test('Linux orchestration compares structured desktop configuration with the Service endpoint', () => {
  const engine = diagnosticEngine()
  const snapshot: NativeSystemProxyDiagnostics = {
    platform: 'linux',
    status: 'available',
    enabled: true,
    proxies: {
      http: { host: '127.0.0.1', port: 19351 },
      https: { host: '127.0.0.1', port: 19351 }
    },
    bypass: defaultSystemProxyBypass('linux'),
    pac: { enabled: false },
    linux: {
      desktopEnvironment: 'GNOME',
      backend: 'gnome',
      mode: 'manual',
      reversedBypass: false,
      environment: [],
      portal: { status: 'unavailable', direct: false, proxies: [] }
    }
  }
  const settings = {
    platform: 'linux',
    intentEnabled: true,
    mode: 'manual' as const,
    expectedBypass: defaultSystemProxyBypass('linux')
  }
  const result = engine.combineSystemProxyDiagnostics(settings, snapshot, runtimeSnapshot())
  assert.equal(result.overall.kind, 'configuration-mismatch')
  assert.match(
    result.results.find((row) => row.id === 'http-proxy')!.details!,
    /Expected: 127.0.0.1:18423\nCurrent: 127.0.0.1:19351/
  )
  assert.equal(result.results.find((row) => row.id === 'connectivity')?.status, 'success')
  const failedService = engine.combineSystemProxyDiagnostics(settings, snapshot, undefined)
  assert.equal(failedService.state.matchesExpectedConfig, null)
  assert.equal(failedService.state.enabled, true)
  assert.doesNotMatch(failedService.report, /Windows|Result: OK/)
})

test('on-demand orchestration coalesces, refreshes and routes explicit actions to Native/Service', async () => {
  const calls: string[] = [],
    logs: string[] = []
  let intent = true
  const engine = diagnosticEngine({
    '../core/manager': { migrateCoreToServiceForDiagnostics: async () => {} },
    '../config': {
      getAppConfig: async () => ({
        sysProxy: { enable: intent },
        corePermissionMode: 'service',
        onlyActiveDevice: true
      }),
      getControledMihomoConfig: () => {
        throw new Error('Desktop must not infer runtime port')
      }
    },
    '../service/api': {
      getProxyRuntimeDiagnostics: async () => {
        calls.push('service')
        return runtimeSnapshot()
      },
      startCore: async () => {
        calls.push('service-start')
      },
      restartCore: async () => {
        calls.push('service-restart')
      }
    },
    './native-system-proxy': {
      getNativeSystemProxyDiagnostics: async () => {
        calls.push('native')
        return nativeSnapshot()
      }
    },
    '../utils/log': {
      appendAppLog: async (value: string) => {
        logs.push(value)
      }
    },
    './sysproxy-operation': {
      changeSysProxy: async (
        enable: boolean,
        onlyActive: boolean,
        apply: () => Promise<string>
      ) => {
        assert.equal(onlyActive, true)
        await apply()
        intent = enable
        return { phase: 'idle', confirmed: enable }
      }
    },
    './sysproxy': {
      applyNativeDiagnosticProxy: async (settings: NativeSystemProxySettings) => {
        calls.push(`native-write:${settings.mode}`)
        if (settings.mode !== 'disabled') assert.equal(settings.port, 18423)
      }
    }
  })
  assert.deepEqual(calls, [])
  const first = engine.runSystemProxyDiagnostics()
  assert.equal(first, engine.runSystemProxyDiagnostics())
  await first
  assert.deepEqual(calls, ['native', 'service'])
  assert.equal(logs.length, 1)
  assert.match(logs[0], /overall status: healthy/)
  await engine.fixSystemProxyDiagnostic('restore-system-proxy')
  assert.deepEqual(calls.slice(-2), ['service', 'native-write:manual'])
  intent = false
  await engine.fixSystemProxyDiagnostic('restore-system-proxy')
  assert.equal(calls.at(-1), 'native-write:disabled')
  await engine.fixSystemProxyDiagnostic('enable-system-proxy')
  assert.equal(calls.at(-1), 'native-write:manual')
  await engine.fixSystemProxyDiagnostic('start-core')
  assert.equal(calls.at(-1), 'service-start')
  await engine.fixSystemProxyDiagnostic('restart-core')
  assert.equal(calls.at(-1), 'service-restart')
  await engine.runSystemProxyDiagnostics()
  assert.deepEqual(calls.slice(-2), ['native', 'service'])
})

test('failed backend calls leave the independent domain visible and cannot repair with a guessed port', async () => {
  const nativeFailed = diagnosticEngine({
    './native-system-proxy': {
      getNativeSystemProxyDiagnostics: async () => {
        throw new Error('private Windows error')
      }
    }
  })
  const nativeResult = await nativeFailed.runSystemProxyDiagnostics()
  assert.equal(nativeResult.results.find((row) => row.id === 'connectivity')?.status, 'success')
  assert.doesNotMatch(nativeResult.report, /private Windows error/)
  const serviceFailed = diagnosticEngine({
    '../service/api': {
      getProxyRuntimeDiagnostics: async () => {
        throw new Error('private service error')
      }
    }
  })
  const serviceResult = await serviceFailed.runSystemProxyDiagnostics()
  assert.equal(serviceResult.results.find((row) => row.id === 'system-proxy')?.status, 'success')
  assert.doesNotMatch(serviceResult.report, /private service error|Result: OK/)
  assert.match(serviceResult.report, /service-unavailable/)
  await assert.rejects(
    serviceFailed.fixSystemProxyDiagnostic('restore-system-proxy'),
    /private service error/
  )
})

test('service DTO validation rejects guessed/invalid ports and retains only diagnostic fields', () => {
  assert.throws(() =>
    validateProxyRuntimeDiagnostics(
      runtimeSnapshot({ proxy: { host: 'remote.example', port: 18423 } })
    )
  )
  assert.throws(() =>
    validateProxyRuntimeDiagnostics(runtimeSnapshot({ proxy: { host: '127.0.0.1', port: 0 } }))
  )
  const result = validateProxyRuntimeDiagnostics({
    ...runtimeSnapshot(),
    config: { token: 'SECRET' }
  })
  assert.doesNotMatch(JSON.stringify(result), /SECRET|config/)
  const summary = buildSystemProxyDiagnostics(
    input({
      connectivity: { outcome: 'outbound-failed', reason: 'https://token:secret@private.example' }
    })
  )
  assert.doesNotMatch(summary.report, /token|secret|private/)
})

test('desktop diagnostic boundary contains no low-level OS/runtime operations', () => {
  const source = readFileSync('src/main/sys/system-proxy-diagnostics.ts', 'utf8')
  assert.doesNotMatch(
    source,
    /execFile|child_process|node:net|node:http|node:https|readWindowsUserProxy|probeProxy|mihomoConfig|getControledMihomoConfig|getCoreRunningForDiagnostics/
  )
})

import {
  validateProxyRuntimeDiagnostics,
  type NativeSystemProxyDiagnostics,
  type ProxyRuntimeDiagnostics,
  type NativeSystemProxySettings
} from '../src/shared/proxy-diagnostics-contract'

test('direct core remediation explains and uses the existing Service ownership transfer', async () => {
  let migrated = 0
  const engine = diagnosticEngine({
    '../config': {
      getAppConfig: async () => ({ sysProxy: { enable: true }, corePermissionMode: 'elevated' })
    },
    '../core/manager': {
      migrateCoreToServiceForDiagnostics: async () => {
        migrated++
      }
    },
    '../service/api': {
      getProxyRuntimeDiagnostics: async (direct: boolean) => {
        assert.equal(direct, true)
        return runtimeSnapshot({
          listener: { available: false },
          connectivity: { available: false, outcome: 'unreachable' }
        })
      },
      startCore: async () => {
        throw new Error('must transfer ownership first')
      },
      restartCore: async () => {
        throw new Error('must transfer ownership first')
      }
    }
  })
  const result = await engine.runSystemProxyDiagnostics()
  const listener = result.results.find((row) => row.id === 'listener')!
  assert.equal(listener.action, 'restart-core')
  assert.match(listener.actionHint!, /Service management/)
  await engine.fixSystemProxyDiagnostic('restart-core')
  await engine.fixSystemProxyDiagnostic('start-core')
  assert.equal(migrated, 2)
})

test('Service ownership transfer restores permission intent on failure and prohibits elevated fallback', async () => {
  for (const fail of [false, true]) {
    const modes: string[] = []
    const migrate = isolatedExport<
      typeof import('../src/main/core/manager').migrateCoreToServiceForDiagnostics
    >('src/main/core/manager.ts', 'migrateCoreToServiceForDiagnostics', {
      getAppConfig: async () => ({ corePermissionMode: 'elevated' }),
      patchAppConfig: async (patch: { corePermissionMode: string }) => {
        modes.push(patch.corePermissionMode)
      },
      mainWindow: undefined,
      startCore: async (detached: boolean, requireService: boolean) => {
        assert.equal(detached, false)
        assert.equal(requireService, true)
        if (fail) throw new Error('service offline')
        return [Promise.resolve()]
      }
    })
    if (fail) await assert.rejects(migrate(), /service offline/)
    else await migrate()
    assert.deepEqual(modes, fail ? ['service', 'elevated'] : ['service'])
  }
})

test('runtime IPC is read-only and has a bounded deadline; repair does not issue a public probe', async () => {
  const calls: unknown[] = []
  const get = isolatedExport<typeof import('../src/main/service/api').getProxyRuntimeDiagnostics>(
    'src/main/service/api.ts',
    'getProxyRuntimeDiagnostics',
    {
      createSignedServiceAxios: (base: string, recover: boolean) => {
        assert.equal(base, 'http://localhost')
        assert.equal(recover, false)
        return {
          request: async (request: unknown) => {
            calls.push(request)
            return runtimeSnapshot()
          }
        }
      },
      serviceContract: { proxyDiagnostics: { method: 'GET', path: '/core/proxy-diagnostics' } },
      validateProxyRuntimeDiagnostics
    }
  )
  await get(true, false)
  assert.deepEqual(calls[0], {
    method: 'GET',
    url: '/core/proxy-diagnostics',
    params: { direct: 'true', probe: 'false' },
    timeout: 10000
  })
})

test('native remediation invalidates legacy retries before guard handoff and starts renewal after adoption', async () => {
  const events: string[] = []
  const generation = 1
  const apply = isolatedExport<
    typeof import('../src/main/sys/sysproxy').applyNativeDiagnosticProxy
  >('src/main/sys/sysproxy.ts', 'applyNativeDiagnosticProxy', {
    assertNativeSystemProxyAvailable: () => {},
    triggerSysProxyRequest: generation,
    cancelPendingSysProxyRetry: () => {
      events.push('cancel-retry')
    },
    stopSysproxyLeaseRenewal: () => {
      events.push('stop-renewal')
    },
    triggerSysProxyTask: Promise.resolve(),
    prepareNativeProxyMutation: async () => {
      events.push('prepare')
    },
    setNativeSystemProxy: async () => {
      events.push('native')
    },
    adoptNativeProxyMutation: async (settings: { server: string }) => {
      assert.equal(settings.server, '127.0.0.1:18423')
      events.push('adopt')
    },
    updateSysproxyGuardEventStream: () => {
      events.push('events')
    },
    startSysproxyLeaseRenewal: () => {
      events.push('renew')
    },
    stopPacServer: async () => {
      events.push('stop-pac')
    }
  })
  await apply(
    { mode: 'manual', host: '127.0.0.1', port: 18423, bypass: ['<local>'] },
    true,
    true,
    true
  )
  assert.deepEqual(events, [
    'cancel-retry',
    'stop-renewal',
    'prepare',
    'native',
    'adopt',
    'events',
    'renew'
  ])
  events.length = 0
  await apply({ mode: 'disabled', bypass: [] }, true, false, false)
  assert.deepEqual(events, [
    'cancel-retry',
    'stop-renewal',
    'prepare',
    'native',
    'stop-pac',
    'events'
  ])
})
