import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import net, { type AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { test } from 'node:test'
import ts from 'typescript'
import { setLocale } from '../src/shared/i18n'
import { defaultSystemProxyBypass } from '../src/shared/system-proxy'
import {
  buildSystemProxyDiagnostics,
  safeProxyAddress,
  type SystemProxyDiagnosticInput
} from '../src/shared/system-proxy-diagnostics'
import { probeProxyConnectivity, probeProxyListener } from '../src/main/sys/system-proxy-probes'

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
  assert.equal(mismatch.result.overall.status, 'error')
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

test('Windows adapters parse empty, hexadecimal and localized registry/dump output without executing writes', async () => {
  const calls: { file: string; args: string[] }[] = []
  const native = load<typeof import('../src/main/sys/platform/windows-system-proxy')>(
    'src/main/sys/platform/windows-system-proxy.ts',
    {
      'kokorobox-native': { listUwpLoopbackApps: () => [{ enabled: true }, { enabled: false }] },
      'node:child_process': {
        execFile: (
          file: string,
          args: string[],
          _options: unknown,
          callback: (error: unknown, result: { stdout: string }) => void
        ) => {
          calls.push({ file, args })
          callback(null, { stdout: '' })
        }
      }
    }
  )
  const parsed = native.parseWindowsProxyRegistry(
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n    AutoConfigURL    REG_SZ    \r\n    ProxyServer    REG_SZ    127.0.0.1:8123\r\n    ProxyEnable    REG_DWORD    0x1\r\n    ProxyOverride    REG_SZ    <local>\r\n'
  )
  assert.deepEqual(parsed, {
    enabled: true,
    server: '127.0.0.1:8123',
    override: '<local>',
    pacUrl: ''
  })
  assert.equal(native.parseWindowsProxyRegistry(' ProxyEnable REG_DWORD 0x0').enabled, false)
  assert.deepEqual(native.parseWinHttpDump('# 当前配置\npushd winhttp\nreset proxy\npopd'), {
    mode: 'direct'
  })
  assert.deepEqual(
    native.parseWinHttpDump('set proxy proxy-server="127.0.0.1:8123" bypass-list="<local>"'),
    { mode: 'proxy', server: '127.0.0.1:8123' }
  )
  assert.deepEqual(native.parseWinHttpDump('set advproxy settings="private"'), { mode: 'advanced' })
  assert.equal(native.parseWinHttpDump('unrecognized').mode, 'unknown')
  assert.equal(native.readLoopbackExemptionCount(), 1)
  await native.readWindowsUserProxy()
  await native.readWinHttpProxy()
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
      ['winhttp', 'dump']
    ]
  )
})

test('on-demand engine coalesces simultaneous runs, checks in order and repairs only on explicit action', async () => {
  const calls: string[] = []
  const logs: string[] = []
  let enabled = false
  let probeCount = 0
  const engine = load<typeof import('../src/main/sys/system-proxy-diagnostics')>(
    'src/main/sys/system-proxy-diagnostics.ts',
    {
      '../config': {
        getAppConfig: async () => ({ sysProxy: { enable: enabled }, onlyActiveDevice: true }),
        getControledMihomoConfig: async () => ({ 'mixed-port': 8123 })
      },
      '../core/manager': {
        getCoreRunningForDiagnostics: async () => {
          calls.push('core')
          return true
        },
        startCore: async () => {
          calls.push('start-core')
          return [Promise.resolve()]
        },
        restartCore: async () => {
          calls.push('restart-core')
        }
      },
      '../core/mihomoApi': {
        mihomoConfigForDiagnostics: async () => {
          calls.push('config')
          return { 'mixed-port': 8123, secret: 'must-not-leak' }
        }
      },
      '../resolve/server': { getActivePacUrl: () => undefined },
      '../utils/log': {
        appendAppLog: async (message: string) => {
          logs.push(message)
        }
      },
      './sysproxy-operation': {
        changeSysProxy: async (next: boolean, onlyActive: boolean) => {
          calls.push(`apply:${next}`)
          assert.equal(onlyActive, true)
          return { phase: 'idle', confirmed: next }
        }
      },
      '../../shared/system-proxy': {
        defaultSystemProxyBypass,
        normalizeProxyHost: () => '127.0.0.1'
      },
      '../../shared/system-proxy-diagnostics': { buildSystemProxyDiagnostics, safeProxyAddress },
      './system-proxy-probes': {
        probeProxyListener: async (host: string, port: number) => {
          calls.push('listener')
          assert.equal(host, '127.0.0.1')
          assert.equal(port, 8123)
          return true
        },
        probeProxyConnectivity: async () => {
          calls.push('connectivity')
          probeCount++
          return { outcome: 'success' }
        }
      },
      './platform/windows-system-proxy': {
        readWindowsUserProxy: async () => {
          calls.push('registry')
          return input().windowsProxy
        },
        readLoopbackExemptionCount: () => {
          calls.push('loopback')
          return 0
        },
        readWinHttpProxy: async () => {
          calls.push('winhttp')
          return { mode: 'direct' }
        }
      }
    },
    'win32'
  )
  assert.deepEqual(calls, [])
  const first = engine.runSystemProxyDiagnostics()
  assert.equal(first, engine.runSystemProxyDiagnostics())
  await first
  assert.deepEqual(calls, [
    'registry',
    'listener',
    'core',
    'config',
    'connectivity',
    'loopback',
    'winhttp'
  ])
  assert.equal(probeCount, 1)
  assert.doesNotMatch(logs.join(''), /must-not-leak/)
  await engine.fixSystemProxyDiagnostic('restore-system-proxy')
  assert.equal(calls.at(-1), 'apply:false')
  enabled = true
  await engine.fixSystemProxyDiagnostic('restore-system-proxy')
  assert.equal(calls.at(-1), 'apply:true')
  await engine.fixSystemProxyDiagnostic('start-core')
  assert.equal(calls.at(-1), 'start-core')
  await engine.fixSystemProxyDiagnostic('restart-core')
  assert.equal(calls.at(-1), 'restart-core')
  assert.equal(probeCount, 1)
  await engine.runSystemProxyDiagnostics()
  assert.equal(probeCount, 2)
})

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

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  return (server.address() as AddressInfo).port
}

test('real TCP and HTTP CONNECT probes distinguish no listener, outbound rejection, authentication and timeout', async (t) => {
  const sockets = new Set<Duplex>()
  const server = http.createServer()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  const port = await listen(server)
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    server.close()
  })
  let mode = 'reject'
  server.on('connect', (request, socket) => {
    assert.equal(request.url, 'www.gstatic.com:443')
    assert.equal(request.headers['proxy-authorization'], undefined)
    if (mode === 'reject') socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
    if (mode === 'auth') socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n')
  })
  assert.equal(await probeProxyListener('127.0.0.1', port), true)
  assert.deepEqual(await probeProxyConnectivity('127.0.0.1', port), {
    outcome: 'outbound-failed',
    reason: 'tunnel-rejected'
  })
  mode = 'auth'
  assert.deepEqual(await probeProxyConnectivity('127.0.0.1', port), {
    outcome: 'outbound-failed',
    reason: 'proxy-authentication'
  })
  mode = 'hang'
  assert.deepEqual(await probeProxyConnectivity('127.0.0.1', port, 60), {
    outcome: 'outbound-failed',
    reason: 'timeout'
  })
  assert.deepEqual(await probeProxyConnectivity('127.0.0.1', 0), {
    outcome: 'unreachable',
    reason: 'invalid-port'
  })
  for (const socket of sockets) socket.destroy()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  assert.equal(await probeProxyListener('127.0.0.1', port), false)
  assert.deepEqual(await probeProxyConnectivity('127.0.0.1', port), {
    outcome: 'unreachable',
    reason: 'connection-refused'
  })
})

test('a successful CONNECT must still get a verified HTTPS 204 response; redirects fail', async (t) => {
  const server = http.createServer()
  const sockets = new Set<Duplex>()
  server.on('connect', (_request, socket) => {
    sockets.add(socket)
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    socket.on('close', () => sockets.delete(socket))
  })
  const port = await listen(server)
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    server.close()
  })
  let statusCode = 204
  let requests = 0
  const probes = load<typeof import('../src/main/sys/system-proxy-probes')>(
    'src/main/sys/system-proxy-probes.ts',
    {
      'node:https': {
        Agent: class {
          createConnection?: () => unknown
          destroy() {
            /* mock agent has no pool */
          }
        },
        request: (
          url: string,
          options: { agent: { createConnection: () => unknown } },
          callback: (response: unknown) => void
        ) => {
          requests++
          assert.equal(url, 'https://www.gstatic.com/generate_204')
          options.agent.createConnection()
          const request = new EventEmitter() as EventEmitter & {
            end: () => void
            destroy: () => void
          }
          request.end = () =>
            callback({
              statusCode,
              destroy() {
                /* mock response has no socket */
              }
            })
          request.destroy = () => {}
          return request
        }
      },
      'node:tls': {
        connect: (options: {
          socket: net.Socket
          servername: string
          rejectUnauthorized: boolean
        }) => {
          assert.ok(options.socket instanceof net.Socket)
          assert.equal(options.servername, 'www.gstatic.com')
          assert.equal(options.rejectUnauthorized, true)
          return options.socket
        }
      }
    }
  )
  assert.deepEqual(await probes.probeProxyConnectivity('127.0.0.1', port), { outcome: 'success' })
  statusCode = 302
  assert.deepEqual(await probes.probeProxyConnectivity('127.0.0.1', port), {
    outcome: 'outbound-failed',
    reason: 'unexpected-response'
  })
  assert.equal(requests, 2)
})
