import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  appRoutingSupported,
  buildProxyBridgeProfile,
  executableName,
  resolveMihomoSocksPort,
  validateAppRoutingConfig
} from '../src/shared/app-routing'

function rule(overrides: Partial<AppRoutingRule> = {}): AppRoutingRule {
  return {
    id: 'rule-1',
    executablePath: 'C:\\Program Files\\Example\\example.exe',
    processName: 'example.exe',
    action: 'proxy',
    protocol: 'both',
    enabled: true,
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

test('selects a dedicated SOCKS port before the mixed port', () => {
  assert.equal(resolveMihomoSocksPort({ 'socks-port': 7891, 'mixed-port': 7890 }), 7891)
  assert.equal(resolveMihomoSocksPort({ 'socks-port': 0, 'mixed-port': 7890 }), 7890)
  assert.equal(resolveMihomoSocksPort({ 'socks-port': 0, 'mixed-port': 0 }), undefined)
})

test('generates an ordered local-only ProxyBridge profile', () => {
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
        protocol: 'udp'
      }),
      rule({
        id: 'rule-3',
        executablePath: '\\\\server\\apps\\direct.exe',
        processName: 'direct.exe',
        action: 'direct',
        protocol: 'tcp',
        enabled: false
      })
    ]
  }
  const profile = JSON.parse(buildProxyBridgeProfile(config, 7890))
  assert.deepEqual(profile.ProxyConfigs, [
    {
      Id: 1,
      Type: 'socks5',
      Host: '127.0.0.1',
      Port: '7890',
      Username: '',
      Password: '',
      SendDomainToProxy: true
    }
  ])
  assert.deepEqual(
    profile.ProxyRules.map((item: Record<string, unknown>) => [
      item.ProcessName,
      item.Action,
      item.Protocol,
      item.IsEnabled,
      item.ProxyConfigId
    ]),
    [
      ['example.exe', 'PROXY', 'BOTH', true, 1],
      ['blocked.exe', 'BLOCK', 'UDP', true, 0],
      ['direct.exe', 'DIRECT', 'TCP', false, 0]
    ]
  )
})

test('native build is pinned and patches missing proxies to fail closed', () => {
  const build = readFileSync('scripts/build-proxybridge.ps1', 'utf8')
  const patch = readFileSync('build/proxybridge/fail-closed.patch', 'utf8')
  assert.match(build, /02703a0672a8b94011a4698368a392f7734c10dc/)
  assert.match(build, /63cb41763bb4b20f600b6de04e991a9c2be73279e317d4d82f237b150c5f3f15/)
  assert.equal((patch.match(/return RULE_ACTION_BLOCK/g) || []).length, 4)
  assert.doesNotMatch(patch, /^\+.*return RULE_ACTION_DIRECT/m)
})
