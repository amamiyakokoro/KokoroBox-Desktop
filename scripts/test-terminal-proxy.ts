import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { promisify } from 'node:util'
import ts from 'typescript'
import { defaultSystemProxyBypass, normalizeProxyHost } from '../src/shared/system-proxy'

const proxy = 'http://127.0.0.1:7890'
const bypass = 'localhost,::1'

function loadTerminalProxy() {
  const current: Record<string, string> = {}
  const manager: Record<string, string> = {}
  const calls: string[][] = []
  const logs: string[] = []
  let nativeResult: boolean | null = null
  let commandFailure: string | undefined
  const run = async (_file: string, args: string[], options: Record<string, unknown>) => {
    calls.push(args)
    assert.equal(options.timeout, 3000)
    assert.equal(options.maxBuffer, 64 * 1024)
    if (args[1] === commandFailure) throw new Error('command failed')
    if (args[1] === 'show-environment') {
      assert.deepEqual(args, ['--user', 'show-environment', '--output=json'])
      return { stdout: JSON.stringify(manager) }
    }
    assert.equal(args[1], 'unset-environment')
    for (const name of args.slice(2)) delete manager[name]
    return { stdout: '' }
  }
  const exec = Object.assign(() => {}, { [promisify.custom]: run })
  const fakeProcess = { platform: 'linux', env: current }
  const dependencies: Record<string, unknown> = {
    'kokorobox-native': {
      clearTerminalProxyEnvironment: async () => nativeResult,
      setTerminalProxyEnvironment: async () => true
    },
    'node:child_process': { execFile: exec },
    'node:util': { promisify },
    '../config': {
      getAppConfig: async () => ({ sysProxy: { host: '127.0.0.1', bypass: ['localhost', '::1'] } }),
      getControledMihomoConfig: async () => ({ 'mixed-port': 7890 })
    },
    '../../shared/system-proxy': { defaultSystemProxyBypass, normalizeProxyHost },
    '../utils/log': { appendAppLog: async (message: string) => logs.push(message) }
  }
  const source = ts.transpileModule(readFileSync('src/main/sys/terminal-proxy.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const module = { exports: {} as typeof import('../src/main/sys/terminal-proxy') }
  new Function('require', 'module', 'exports', 'process', source)(
    (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
      return dependencies[name]
    },
    module,
    module.exports,
    fakeProcess
  )
  return {
    api: module.exports,
    current,
    manager,
    calls,
    logs,
    fakeProcess,
    setNativeResult: (value: boolean | null) => {
      nativeResult = value
    },
    failCommand: (value: string) => {
      commandFailure = value
    }
  }
}

test('disable clears stale session and app proxies even when the managed file is missing', async () => {
  const fixture = loadTerminalProxy()
  const values = { http_proxy: proxy, HTTPS_PROXY: proxy, no_proxy: bypass, NO_PROXY: bypass }
  Object.assign(fixture.current, values)
  Object.assign(fixture.manager, values)
  await fixture.api.disableTerminalProxy()
  assert.deepEqual(fixture.current, {})
  assert.deepEqual(fixture.manager, {})
  assert.deepEqual(fixture.calls[1], [
    '--user',
    'unset-environment',
    'http_proxy',
    'HTTPS_PROXY',
    'no_proxy',
    'NO_PROXY'
  ])
  await fixture.api.disableTerminalProxy()
  assert.equal(fixture.calls.filter((args) => args[1] === 'unset-environment').length, 1)
})

test('missing-file recovery preserves unrelated proxy and bypass values', async () => {
  const fixture = loadTerminalProxy()
  Object.assign(fixture.current, {
    http_proxy: proxy,
    HTTPS_PROXY: 'http://other:8080',
    no_proxy: '*'
  })
  Object.assign(fixture.manager, {
    http_proxy: proxy,
    ALL_PROXY: 'socks5://other:1080',
    NO_PROXY: '*'
  })
  await fixture.api.disableTerminalProxy()
  assert.deepEqual(fixture.current, { HTTPS_PROXY: 'http://other:8080', no_proxy: '*' })
  assert.deepEqual(fixture.manager, { ALL_PROXY: 'socks5://other:1080', NO_PROXY: '*' })
})

test('a matching bypass alone is insufficient to claim an environment', async () => {
  const fixture = loadTerminalProxy()
  fixture.current.no_proxy = bypass
  fixture.manager.NO_PROXY = bypass
  await fixture.api.disableTerminalProxy()
  assert.equal(fixture.current.no_proxy, bypass)
  assert.equal(fixture.manager.NO_PROXY, bypass)
  assert.equal(fixture.calls.length, 1)
})

test('unavailable manager still clears app values and reports the session limitation', async () => {
  const fixture = loadTerminalProxy()
  fixture.current.http_proxy = proxy
  fixture.failCommand('show-environment')
  await fixture.api.disableTerminalProxy()
  assert.deepEqual(fixture.current, {})
  assert.match(fixture.logs[0], /systemd user manager unavailable/)
})

test('failed session cleanup cannot silently report success', async () => {
  const fixture = loadTerminalProxy()
  fixture.manager.http_proxy = proxy
  fixture.failCommand('unset-environment')
  await assert.rejects(fixture.api.disableTerminalProxy(), /Failed to clear stale terminal proxy/)
})

test('successful Native cleanup retains its path without compatibility commands', async () => {
  const fixture = loadTerminalProxy()
  fixture.setNativeResult(true)
  fixture.current.http_proxy = proxy
  await fixture.api.disableTerminalProxy()
  assert.deepEqual(fixture.current, {})
  assert.equal(fixture.calls.length, 0)
})

test('other platforms never mutate terminal proxy environment', async () => {
  const fixture = loadTerminalProxy()
  fixture.fakeProcess.platform = 'darwin'
  fixture.current.http_proxy = proxy
  await fixture.api.disableTerminalProxy()
  assert.equal(fixture.current.http_proxy, proxy)
  assert.equal(fixture.calls.length, 0)
})
