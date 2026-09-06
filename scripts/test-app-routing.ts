import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  appRoutingSupported,
  buildProcessRouterCommand,
  executableName,
  normalizeAppRoutingConfig,
  validateAppRoutingConfig
} from '../src/shared/app-routing'
import {
  appRoutingListenerName,
  appRoutingSocksPort,
  applyAppRoutingListener
} from '../src/main/app-routing/profile'

function rule(overrides: Partial<AppRoutingRule> = {}): AppRoutingRule {
  return {
    id: 'rule-1',
    executablePath: 'C:\\Program Files\\Example\\example.exe',
    processName: 'example.exe',
    displayName: 'Example',
    action: 'proxy',
    protocol: 'both',
    enabled: true,
    priority: 1,
    ...overrides
  }
}

test('application routing is limited to Windows x64', () => {
  assert.equal(appRoutingSupported('win32', 'x64'), true)
  assert.equal(appRoutingSupported('win32', 'arm64'), false)
  assert.equal(appRoutingSupported('darwin', 'x64'), false)
  assert.equal(appRoutingSupported('linux', 'x64'), false)
})

test('validates absolute exe paths and prevents ambiguous or internal process rules', () => {
  validateAppRoutingConfig({ version: 1, enabled: true, rules: [rule()] })
  assert.equal(executableName('C:/Program Files/Example/example.exe'), 'example.exe')
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      rules: [rule(), rule({ id: 'rule-2', executablePath: 'D:\\Other\\example.exe' })]
    })
  )
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      rules: [rule({ executablePath: 'relative.exe', processName: 'relative.exe' })]
    })
  )
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      rules: [rule({ executablePath: 'C:\\KokoroBox.exe', processName: 'KokoroBox.exe' })]
    })
  )
})

test('injects and removes the isolated loopback Mihomo listener', () => {
  const profile = {
    listeners: [{ name: 'user-listener', type: 'mixed', port: 7890 }]
  } as MihomoConfig
  applyAppRoutingListener(profile, true)
  assert.deepEqual(profile.listeners, [
    { name: 'user-listener', type: 'mixed', port: 7890 },
    {
      name: appRoutingListenerName,
      type: 'socks',
      port: appRoutingSocksPort,
      listen: '127.0.0.1',
      udp: true
    }
  ])
  applyAppRoutingListener(profile, false)
  assert.deepEqual(profile.listeners, [{ name: 'user-listener', type: 'mixed', port: 7890 }])
})

test('generates an ordered local-only process-router command', () => {
  const config: AppRoutingConfig = {
    version: 1,
    enabled: true,
    rules: [
      rule(),
      rule({
        id: 'rule-2',
        executablePath: 'D:\\Tools\\blocked.exe',
        processName: 'blocked.exe',
        action: 'block',
        protocol: 'udp',
        priority: 2
      }),
      rule({
        id: 'rule-3',
        executablePath: '\\\\server\\apps\\direct.exe',
        processName: 'direct.exe',
        action: 'direct',
        protocol: 'tcp',
        enabled: false,
        priority: 3
      })
    ]
  }
  const command = JSON.parse(buildProcessRouterCommand(config, appRoutingSocksPort))
  assert.deepEqual(command.proxy, { host: '127.0.0.1', port: 7891 })
  assert.equal(command.version, 1)
  assert.equal(command.command, 'replace_rules')
  assert.deepEqual(
    command.rules.map((item: Record<string, unknown>) => [
      item.processName,
      item.action,
      item.protocol,
      item.enabled,
      item.priority
    ]),
    [
      ['example.exe', 'PROXY', 'BOTH', true, 1],
      ['blocked.exe', 'BLOCK', 'UDP', true, 2],
      ['direct.exe', 'DIRECT', 'TCP', false, 3]
    ]
  )
})

test('normalizes persisted order into unique priorities', () => {
  const normalized = normalizeAppRoutingConfig({
    version: 1,
    enabled: true,
    rules: [
      rule({ priority: 20 }),
      rule({ id: 'second', processName: 'b.exe', executablePath: 'C:\\b.exe', priority: 10 })
    ]
  })
  assert.deepEqual(
    normalized.rules.map((item) => [item.processName, item.priority]),
    [
      ['b.exe', 1],
      ['example.exe', 2]
    ]
  )
})

test('native build is pinned and patches missing proxies to fail closed', () => {
  const build = readFileSync('scripts/build-proxybridge.ps1', 'utf8')
  const patch = readFileSync('build/proxybridge/fail-closed.patch', 'utf8')
  const router = readFileSync('build/proxybridge/kokorobox_process_router.c', 'utf8')
  assert.match(build, /02703a0672a8b94011a4698368a392f7734c10dc/)
  assert.match(build, /63cb41763bb4b20f600b6de04e991a9c2be73279e317d4d82f237b150c5f3f15/)
  assert.equal((patch.match(/return RULE_ACTION_BLOCK/g) || []).length, 4)
  assert.doesNotMatch(patch, /^\+.*return RULE_ACTION_DIRECT/m)
  assert.match(build, /kokorobox-process-router\.exe/)
  assert.equal(router.includes('\\"command\\":\\"replace_rules\\"'), true)
  assert.doesNotMatch(router, /--profile|--update|WinHttp/)
})
