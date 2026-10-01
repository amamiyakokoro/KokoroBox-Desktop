import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import { setLocale } from '../src/shared/i18n'
import { defaultSystemProxyBypass } from '../src/shared/system-proxy'
import { buildLinuxSystemProxyDiagnostics } from '../src/shared/linux-system-proxy-diagnostics'
import { buildMacOSSystemProxyDiagnostics } from '../src/shared/macos-system-proxy-diagnostics'
import { appendDNSDiagnostics, canRepairDNS } from '../src/shared/dns-diagnostics'
import { bootstrapDNSAddresses } from '../src/main/sys/dns-bootstrap'
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
  const isolatedSource =
    ts.isFunctionDeclaration(statement) &&
    !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ? `export ${statement.getText(source)}`
      : statement.getText(source)
  const compiled = ts.transpileModule(isolatedSource, {
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
function diagnosticEngine(
  overrides: Record<string, unknown> = {},
  platform: NodeJS.Platform = 'win32'
) {
  return load<typeof import('../src/main/sys/system-proxy-diagnostics')>(
    'src/main/sys/system-proxy-diagnostics.ts',
    {
      '../core/manager': { migrateCoreToServiceForDiagnostics: async () => {} },
      '../core/factory': {
        getRuntimeConfig: async () => ({ dns: { 'default-nameserver': ['tls://223.5.5.5'] } })
      },
      './dns-bootstrap': { bootstrapDNSAddresses },
      '../../shared/dns-diagnostics': { appendDNSDiagnostics, canRepairDNS },
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
      '../../shared/proxy-diagnostics-contract': { proxyRuntimeDiagnosticsFailure },
      '../../shared/system-proxy': { defaultSystemProxyBypass },
      '../../shared/system-proxy-diagnostics': { buildSystemProxyDiagnostics },
      '../../shared/linux-system-proxy-diagnostics': { buildLinuxSystemProxyDiagnostics },
      '../../shared/macos-system-proxy-diagnostics': { buildMacOSSystemProxyDiagnostics },
      ...overrides,
      './native-system-proxy': {
        getNativeSystemProxyDiagnostics: async () => nativeSnapshot(),
        getNativeSystemDNSDiagnostics: async () => {
          throw new Error('old-native')
        },
        ...(overrides['./native-system-proxy'] as object)
      }
    },
    platform
  )
}

test('DNS repair copies system DNS into bootstrap on all platforms and never writes OS DNS', async () => {
  for (const platform of ['win32', 'darwin', 'linux'] as const) {
    let bootstrap = ['tls://223.5.5.5']
    const writes: unknown[] = []
    let restarts = 0
    const dns = {
      outcome: 'failed' as const,
      queries: ['www.gstatic.com', 'example.com'].map((domain) => ({
        domain,
        outcome: 'failed' as const
      })),
      interface: platform === 'win32' ? 'Wi-Fi' : 'en0',
      service: platform === 'darwin' ? 'Wi-Fi' : null,
      servers: ['192.168.1.1', '2606:4700:4700::1111']
    }
    const engine = diagnosticEngine(
      {
        '../core/manager': {
          restartCore: async () => {
            restarts++
          },
          migrateCoreToServiceForDiagnostics: async () => {
            throw new Error('Must not change core ownership')
          }
        },
        '../config': {
          getAppConfig: async () => ({ sysProxy: { enable: true }, corePermissionMode: 'service' }),
          patchControledMihomoConfig: async (patch: Partial<MihomoConfig>) => {
            writes.push(patch)
            bootstrap = [...patch.dns!['default-nameserver']!]
          }
        },
        '../core/factory': {
          getRuntimeConfig: async () => ({ dns: { 'default-nameserver': bootstrap } })
        },
        './native-system-proxy': {
          getNativeSystemDNSDiagnostics: async () => dns,
          setNativeSystemDNS: async () => {
            throw new Error('OS DNS must not be changed')
          }
        }
      },
      platform
    )
    await assert.rejects(
      engine.fixSystemProxyDiagnostic('restore-bootstrap-dns'),
      /Run DNS diagnostics/
    )
    const diagnostic = await engine.runSystemProxyDiagnostics()
    assert.equal(writes.length, 0)
    assert.equal(
      diagnostic.results.find((row) => row.id === 'dns-settings')?.action,
      'restore-bootstrap-dns'
    )
    await engine.fixSystemProxyDiagnostic('restore-bootstrap-dns')
    assert.deepEqual(writes, [{ dns: { 'default-nameserver': dns.servers } }])
    assert.equal(restarts, 1)
    await assert.rejects(
      engine.fixSystemProxyDiagnostic('restore-bootstrap-dns'),
      /Run DNS diagnostics/
    )
    bootstrap = ['tls://223.5.5.5']
    await engine.runSystemProxyDiagnostics()
    bootstrap = ['tls://1.1.1.1']
    await assert.rejects(
      engine.fixSystemProxyDiagnostic('restore-bootstrap-dns'),
      /Bootstrap DNS changed/
    )
    assert.equal(writes.length, 1)
    bootstrap = ['tls://223.5.5.5']
    await engine.runSystemProxyDiagnostics()
    dns.servers = ['192.168.2.1']
    await assert.rejects(
      engine.fixSystemProxyDiagnostic('restore-bootstrap-dns'),
      /System DNS changed/
    )
    assert.equal(writes.length, 1)
  }
})

test('bootstrap repair respects DNS ownership and does not conceal save or restart failures', async () => {
  for (const failure of ['ownership', 'save', 'effective-config', 'restart']) {
    let controlled = true
    let bootstrap = ['tls://223.5.5.5']
    let ready = true
    let writes = 0
    let restarts = 0
    const dns = {
      outcome: 'failed' as const,
      queries: ['www.gstatic.com', 'example.com'].map((domain) => ({
        domain,
        outcome: 'failed' as const
      })),
      interface: 'Wi-Fi',
      servers: ['192.168.1.1']
    }
    const engine = diagnosticEngine({
      '../config': {
        getAppConfig: async () => ({
          sysProxy: { enable: true },
          corePermissionMode: 'service',
          controlDns: controlled
        }),
        patchControledMihomoConfig: async (patch: Partial<MihomoConfig>) => {
          writes++
          if (failure === 'save') throw new Error('save failed')
          if (failure !== 'effective-config') bootstrap = [...patch.dns!['default-nameserver']!]
        }
      },
      '../core/factory': {
        getRuntimeConfig: async () => ({ dns: { 'default-nameserver': bootstrap } })
      },
      '../core/manager': {
        restartCore: async () => {
          restarts++
          ready = failure !== 'restart'
        }
      },
      '../service/api': {
        getProxyRuntimeDiagnostics: async () => runtimeSnapshot({ core: { running: true, ready } })
      },
      './native-system-proxy': { getNativeSystemDNSDiagnostics: async () => dns }
    })
    await engine.runSystemProxyDiagnostics()
    if (failure === 'ownership') controlled = false
    await assert.rejects(
      engine.fixSystemProxyDiagnostic('restore-bootstrap-dns'),
      /not managed|save failed|overridden|restart failed/
    )
    assert.equal(writes, failure === 'ownership' ? 0 : 1)
    assert.equal(restarts, failure === 'restart' ? 1 : 0)
  }
})

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
    { name: 'service failed', native: nativeSnapshot(), kind: 'runtime-unavailable' }
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
      !c.runtime ? 'info' : c.runtime.connectivity.available ? 'success' : 'error',
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
  proxyRuntimeDiagnosticsFailure,
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
      validateProxyRuntimeDiagnostics,
      proxyRuntimeDiagnosticsFailure
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

test('runtime transport failures retain stable causes without exposing response bodies', async () => {
  const cases: [unknown, string][] = [
    [{ response: { status: 404, data: 'SECRET' } }, 'service-diagnostics-unsupported'],
    [{ status: 405 }, 'service-diagnostics-unsupported'],
    [{ status: 401 }, 'service-authentication-required'],
    [{ status: 403 }, 'service-permission-denied'],
    [{ status: 408 }, 'service-timeout'],
    [{ status: 504 }, 'service-timeout'],
    [Object.assign(new Error('SECRET'), { code: 'ECONNABORTED' }), 'service-timeout'],
    [{ code: 'ETIMEDOUT' }, 'service-timeout'],
    [{ status: 500 }, 'service-request-failed'],
    [new Error('SECRET'), 'service-unavailable'],
    [{ code: 'service-response-invalid' }, 'service-response-invalid']
  ]
  for (const [error, code] of cases) {
    assert.equal(proxyRuntimeDiagnosticsFailure(error), code)
    const get = isolatedExport<typeof import('../src/main/service/api').getProxyRuntimeDiagnostics>(
      'src/main/service/api.ts',
      'getProxyRuntimeDiagnostics',
      {
        createSignedServiceAxios: (_: string, recover: boolean) => {
          assert.equal(recover, false)
          return {
            request: async () => {
              throw error
            }
          }
        },
        serviceContract: { proxyDiagnostics: { method: 'GET', path: '/core/proxy-diagnostics' } },
        validateProxyRuntimeDiagnostics,
        proxyRuntimeDiagnosticsFailure
      }
    )
    await assert.rejects(get(), (failure: Error & { code?: string }) => {
      assert.equal(failure.message, code)
      assert.equal(failure.code, code)
      assert.doesNotMatch(JSON.stringify(failure), /SECRET/)
      return true
    })
  }
  const invalid = isolatedExport<
    typeof import('../src/main/service/api').getProxyRuntimeDiagnostics
  >('src/main/service/api.ts', 'getProxyRuntimeDiagnostics', {
    createSignedServiceAxios: () => ({ request: async () => ({ private: 'SECRET' }) }),
    serviceContract: { proxyDiagnostics: { method: 'GET', path: '/core/proxy-diagnostics' } },
    validateProxyRuntimeDiagnostics,
    proxyRuntimeDiagnosticsFailure
  })
  await assert.rejects(invalid(), {
    message: 'service-response-invalid',
    code: 'service-response-invalid'
  })
})

test('Service error wrapping retains empty HTTP response status and transport timeout codes', () => {
  class WrappedError extends Error {
    status?: number
    code?: string
    constructor(message: string, options: { status?: number; code?: string }) {
      super(message)
      Object.assign(this, options)
    }
  }
  const wrap = isolatedExport<(error: unknown) => WrappedError>(
    'src/main/service/api.ts',
    'createServiceAPIError',
    {
      ServiceAPIError: WrappedError,
      getResponseErrorMessage: (_: unknown, fallback: string) => fallback,
      tr: (message: string) => message
    }
  )
  assert.equal(
    proxyRuntimeDiagnosticsFailure(wrap({ response: { status: 404, data: '' } })),
    'service-diagnostics-unsupported'
  )
  assert.equal(
    proxyRuntimeDiagnosticsFailure(
      wrap(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))
    ),
    'service-timeout'
  )
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

test('macOS orchestration uses Native OS facts and Service endpoint, preserving independent failures', async () => {
  const endpoint = runtimeSnapshot().proxy
  const proxies = {
    http: { enabled: true, endpoint: { ...endpoint, port: endpoint.port! } },
    https: { enabled: true, endpoint: { ...endpoint, port: endpoint.port! } },
    socks: { enabled: false },
    pacEnabled: false,
    autoDiscovery: false,
    excludeSimpleHostnames: true,
    bypass: defaultSystemProxyBypass('darwin')
  }
  const native: NativeSystemProxyDiagnostics = {
    platform: 'darwin',
    status: 'available',
    enabled: true,
    proxies: {},
    pac: { enabled: false },
    bypass: proxies.bypass,
    macos: {
      effective: proxies,
      activeServiceIds: ['ethernet'],
      networkLocation: 'Office',
      services: [
        {
          id: 'ethernet',
          name: 'Ethernet',
          enabled: true,
          active: true,
          primary: true,
          status: 'available',
          proxies
        }
      ]
    }
  }
  for (const failure of ['none', 'native', 'service', 'unsupported', 'timeout']) {
    const logs: string[] = []
    const engine = diagnosticEngine(
      {
        './native-system-proxy': {
          getNativeSystemProxyDiagnostics: async () => {
            if (failure === 'native') throw new Error('private native error')
            return native
          }
        },
        '../service/api': {
          getProxyRuntimeDiagnostics: async () => {
            if (failure === 'service') throw new Error('private service error')
            if (failure === 'unsupported')
              throw Object.assign(new Error('private service error'), { status: 404 })
            if (failure === 'timeout')
              throw Object.assign(new Error('private service error'), { code: 'ETIMEDOUT' })
            return runtimeSnapshot()
          }
        },
        '../utils/log': {
          appendAppLog: async (message: string) => {
            logs.push(message)
          }
        }
      },
      'darwin'
    )
    const result = await engine.runSystemProxyDiagnostics()
    const row = (id: string) => result.results.find((r) => r.id === id)!
    if (failure === 'none') {
      assert.equal(result.overall.kind, 'healthy')
      assert.match(
        row('http-proxy').details!,
        new RegExp(`Expected: 127\\.0\\.0\\.1:${endpoint.port}`)
      )
      assert.equal(row('network-location').summary, 'Office')
    } else if (failure === 'native') {
      assert.equal(result.overall.kind, 'configuration-unavailable')
      assert.equal(row('connectivity').status, 'success')
    } else {
      assert.equal(result.overall.kind, 'runtime-unavailable')
      assert.equal(row('http-proxy').summary, `127.0.0.1:${endpoint.port}`)
      assert.match(row('http-proxy').details!, /Expected: Unknown/)
      assert.equal(result.state.matchesExpectedConfig, null)
      assert.equal(result.state.coreRunning, null)
      assert.equal(result.state.listenerAvailable, null)
      assert.equal(result.state.connectivityAvailable, null)
      assert.equal(result.overall.status, 'warning')
      assert.equal(row('runtime-diagnostics').status, 'warning')
      for (const id of ['core', 'core-config', 'listener', 'connectivity']) {
        assert.equal(row(id).status, 'info')
        assert.equal(row(id).action, undefined)
      }
      assert.equal(row('core-config').summary, 'Not checked')
      assert.equal(row('connectivity').summary, 'Not checked')
      assert.doesNotMatch(result.report, /Core configuration failed|HTTPS request through/)
      const code =
        failure === 'unsupported'
          ? 'service-diagnostics-unsupported'
          : failure === 'timeout'
            ? 'service-timeout'
            : 'service-unavailable'
      assert.match(row('runtime-diagnostics').details!, new RegExp(code))
      assert.match(logs[0], new RegExp(code))
      if (failure === 'unsupported') {
        assert.equal(
          row('runtime-diagnostics').summary,
          'The running Service does not support proxy diagnostics'
        )
        assert.match(row('runtime-diagnostics').details!, /restart Service/)
      }
    }
    assert.equal(logs.length, 1)
    assert.match(logs[0], /platform: darwin; overall status:/)
    assert.doesNotMatch(result.report + logs.join(), /private .* error|7890|WinHTTP|AppContainer/)
  }
})

test('preserved macOS PAC/discovery suspend legacy cleanup and forward the selected service scope', async () => {
  const events: string[] = []
  const apply = isolatedExport<
    typeof import('../src/main/sys/sysproxy').applyNativeDiagnosticProxy
  >('src/main/sys/sysproxy.ts', 'applyNativeDiagnosticProxy', {
    assertNativeSystemProxyAvailable: () => {},
    triggerSysProxyRequest: 0,
    cancelPendingSysProxyRetry: () => events.push('cancel'),
    stopSysproxyLeaseRenewal: () => events.push('stop-renewal'),
    triggerSysProxyTask: Promise.resolve(),
    prepareNativeProxyMutation: async () => {
      events.push('prepare')
    },
    setNativeSystemProxy: async (settings: NativeSystemProxySettings) => {
      assert.equal(settings.onlyActiveDevice, true)
      events.push('native')
      return { automaticSettingsPreserved: true }
    },
    updateSysproxyGuardEventStream: (enabled: boolean) => {
      assert.equal(enabled, false)
      events.push('stop-events')
    },
    adoptNativeProxyMutation: async () => {
      throw new Error('would resume unsafe cleanup')
    },
    startSysproxyLeaseRenewal: () => {
      throw new Error('would resume unsafe guard')
    },
    stopPacServer: async () => {
      throw new Error('must preserve PAC server')
    }
  })
  await apply(
    { mode: 'manual', host: '127.0.0.1', port: runtimeSnapshot().proxy.port!, bypass: [] },
    true,
    true,
    true
  )
  assert.deepEqual(events, ['cancel', 'stop-renewal', 'prepare', 'native', 'stop-events'])
})

test('macOS Native reads stay short while explicit repair permits a bounded administrator dialog', async () => {
  const deadlines: number[] = []
  const deps = {
    systemProxy: {
      getSystemProxyDiagnostics: async () => nativeSnapshot(),
      setSystemProxy: async () => ({ automaticSettingsPreserved: true })
    },
    bounded: async (task: Promise<unknown>, deadline: number) => {
      deadlines.push(deadline)
      return task
    },
    assertNativeSystemProxyAvailable: () => {},
    process: { platform: 'darwin' }
  }
  const get = isolatedExport<
    typeof import('../src/main/sys/native-system-proxy').getNativeSystemProxyDiagnostics
  >('src/main/sys/native-system-proxy.ts', 'getNativeSystemProxyDiagnostics', deps)
  const set = isolatedExport<
    typeof import('../src/main/sys/native-system-proxy').setNativeSystemProxy
  >('src/main/sys/native-system-proxy.ts', 'setNativeSystemProxy', deps)
  await get()
  assert.deepEqual(await set({ mode: 'manual', host: '127.0.0.1', port: 18423, bypass: [] }), {
    automaticSettingsPreserved: true
  })
  assert.deepEqual(deadlines, [4000, 120000])
})
