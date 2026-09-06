import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  appRoutingSupported,
  executableName,
  isProtectedAppRoutingProcess,
  migrateAppRoutingConfig,
  normalizeAppRoutingConfig,
  normalizeWindowsExecutablePath,
  validateAppRoutingConfig
} from '../src/shared/app-routing'
import {
  appRoutingListenerName,
  appRoutingSocksPort,
  applyAppRoutingListener,
  buildProcessRouterCommand,
  protectedNetworkTargets,
  protectedProcessNames
} from '../src/main/app-routing/profile'
import { isSuccessfulSocks5Greeting } from '../src/main/app-routing/health'
import { parseProcessRouterEvent } from '../src/main/app-routing/protocol'
import {
  processRouterBinaryNames,
  proxyBridgeSourceRevision,
  validateProcessRouterManifest,
  winDivertArchiveSha256,
  winDivertVersion
} from '../src/main/app-routing/integrity-manifest'
import {
  buildServiceProcessRouterRules,
  validateServiceProcessRouterStatus
} from '../src/main/app-routing/service-protocol'

function rule(overrides: Partial<AppRoutingRule> = {}): AppRoutingRule {
  return {
    id: 'rule-1',
    executablePath: 'C:\\Program Files\\Example\\example.exe',
    executableName: 'example.exe',
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
  validateAppRoutingConfig({ version: 1, enabled: true, failClosed: true, rules: [rule()] })
  assert.equal(executableName('C:/Program Files/Example/example.exe'), 'example.exe')
  assert.equal(
    normalizeWindowsExecutablePath('\\\\?\\C:\\Apps\\example.exe'),
    'C:\\Apps\\example.exe'
  )
  assert.equal(
    normalizeWindowsExecutablePath('\\\\?\\UNC\\server\\share\\example.exe'),
    '\\\\server\\share\\example.exe'
  )
  assert.doesNotThrow(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      rules: [rule(), rule({ id: 'rule-2', executablePath: 'D:\\Other\\example.exe', priority: 2 })]
    })
  )
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      rules: [rule(), rule({ id: 'rule-2', priority: 2 })]
    })
  )
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      rules: [rule({ executablePath: 'relative.exe', executableName: 'relative.exe' })]
    })
  )
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      rules: [rule({ executablePath: 'C:\\KokoroBox.exe', executableName: 'KokoroBox.exe' })]
    })
  )
  assert.equal(isProtectedAppRoutingProcess('sparkle-service.exe'), true)
  assert.equal(isProtectedAppRoutingProcess('kokorobox-desktop-windows-2.0.0-x64-setup.exe'), true)
  assert.throws(() =>
    validateAppRoutingConfig({ version: 1, enabled: true, failClosed: false as true, rules: [] })
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

test('requires a complete no-auth SOCKS5 handshake response', () => {
  assert.equal(isSuccessfulSocks5Greeting(Uint8Array.from([0x05, 0x00])), true)
  assert.equal(isSuccessfulSocks5Greeting(Uint8Array.from([0x05])), false)
  assert.equal(isSuccessfulSocks5Greeting(Uint8Array.from([0x05, 0xff])), false)
  assert.equal(isSuccessfulSocks5Greeting(Uint8Array.from([0x04, 0x00])), false)
})

test('rejects malformed or mismatched sidecar protocol events', () => {
  assert.deepEqual(parseProcessRouterEvent('{"version":1,"event":"rules_replaced"}'), {
    version: 1,
    event: 'rules_replaced'
  })
  assert.throws(() => parseProcessRouterEvent('{"version":2,"event":"rules_replaced"}'))
  assert.throws(() => parseProcessRouterEvent('{"version":1,"event":"unknown"}'))
  assert.throws(() => parseProcessRouterEvent('not-json'))
})

test('generates an ordered local-only process-router command', () => {
  const config: AppRoutingConfig = {
    version: 1,
    enabled: true,
    failClosed: true,
    rules: [
      rule(),
      rule({
        id: 'rule-2',
        executablePath: 'D:\\Tools\\blocked.exe',
        executableName: 'blocked.exe',
        action: 'block',
        protocol: 'udp',
        priority: 2
      }),
      rule({
        id: 'rule-3',
        executablePath: '\\\\server\\apps\\direct.exe',
        executableName: 'direct.exe',
        action: 'direct',
        protocol: 'tcp',
        enabled: false,
        priority: 3
      })
    ]
  }
  const command = JSON.parse(buildProcessRouterCommand(config, true))
  assert.deepEqual(command.proxy, { host: '127.0.0.1', port: 7891 })
  assert.equal(command.version, 1)
  assert.equal(command.command, 'replace_rules')
  assert.deepEqual(
    command.rules.map((item: Record<string, unknown>) => [
      item.executablePath,
      item.action,
      item.protocol,
      item.enabled,
      item.priority
    ]),
    [
      ['C:\\Program Files\\Example\\example.exe', 'PROXY', 'BOTH', true, 1],
      ['D:\\Tools\\blocked.exe', 'BLOCK', 'UDP', true, 2],
      ['\\\\server\\apps\\direct.exe', 'DIRECT', 'TCP', false, 3]
    ]
  )
  const failClosed = JSON.parse(buildProcessRouterCommand(config, false))
  assert.equal(failClosed.failClosed, true)
  assert.deepEqual(
    failClosed.rules.map((item: Record<string, unknown>) => item.action),
    ['BLOCK', 'BLOCK', 'DIRECT']
  )
  assert.ok(protectedProcessNames.includes('kokorobox-process-router.exe'))
  assert.ok(protectedNetworkTargets.includes('::1'))
})

test('generates and validates the authenticated service protocol', () => {
  const config: AppRoutingConfig = {
    version: 1,
    enabled: true,
    failClosed: true,
    rules: [rule()]
  }
  assert.deepEqual(buildServiceProcessRouterRules(config, 7891), {
    version: 1,
    proxy_port: 7891,
    fail_closed: true,
    rules: [
      {
        id: 'rule-1',
        executable_path: 'C:\\Program Files\\Example\\example.exe',
        executable_name: 'example.exe',
        action: 'proxy',
        protocol: 'both',
        enabled: true,
        priority: 1
      }
    ]
  })
  const status = {
    version: 1 as const,
    supported: true,
    state: 'blocked' as const,
    generation: 3,
    mihomo_available: false,
    protected_application_count: 1,
    proxy_port: 7891
  }
  assert.equal(validateServiceProcessRouterStatus(status), status)
  assert.throws(() => validateServiceProcessRouterStatus({ ...status, version: 2 as 1 }))
  assert.throws(() => validateServiceProcessRouterStatus({ ...status, proxy_port: 1080 }))
})

test('normalizes persisted order into unique priorities', () => {
  const normalized = normalizeAppRoutingConfig({
    version: 1,
    enabled: true,
    failClosed: true,
    rules: [
      rule({ priority: 20 }),
      rule({ id: 'second', executableName: 'b.exe', executablePath: 'C:\\b.exe', priority: 10 })
    ]
  })
  assert.deepEqual(
    normalized.rules.map((item) => [item.executableName, item.priority]),
    [
      ['b.exe', 1],
      ['example.exe', 2]
    ]
  )
})

test('migrates the previous AppConfig into the canonical fail-closed schema', () => {
  const migrated = migrateAppRoutingConfig({
    version: 1,
    enabled: true,
    rules: [
      {
        id: 'legacy',
        executablePath: 'C:\\legacy.exe',
        processName: 'legacy.exe',
        displayName: 'Legacy',
        iconCacheKey: 'ignored',
        protocol: 'tcp',
        action: 'proxy',
        enabled: true
      }
    ]
  })
  assert.deepEqual(migrated, {
    version: 1,
    enabled: true,
    failClosed: true,
    rules: [
      {
        id: 'legacy',
        enabled: true,
        priority: 1,
        executablePath: 'C:\\legacy.exe',
        executableName: 'legacy.exe',
        protocol: 'tcp',
        action: 'proxy'
      }
    ]
  })
  assert.deepEqual(Object.keys(migrated).sort(), ['enabled', 'failClosed', 'rules', 'version'])
  assert.deepEqual(Object.keys(migrated.rules[0]).sort(), [
    'action',
    'enabled',
    'executableName',
    'executablePath',
    'id',
    'priority',
    'protocol'
  ])
})

test('requires every pinned native binary to match its build manifest', () => {
  const hash = 'a'.repeat(64)
  const hashes = Object.fromEntries(processRouterBinaryNames.map((name) => [name, hash]))
  const manifest = {
    version: 1 as const,
    proxyBridgeRevision: proxyBridgeSourceRevision,
    winDivertVersion,
    winDivertArchiveSha256,
    sha256: hashes
  }
  validateProcessRouterManifest(manifest, hashes)
  assert.throws(
    () =>
      validateProcessRouterManifest(manifest, { ...hashes, 'ProxyBridgeCore.dll': 'b'.repeat(64) }),
    /checksum mismatch/
  )
  assert.throws(
    () =>
      validateProcessRouterManifest({ ...manifest, proxyBridgeRevision: '0'.repeat(40) }, hashes),
    /source provenance/
  )
})

test('native build is pinned and patches missing proxies to fail closed', () => {
  const build = readFileSync('scripts/build-proxybridge.ps1', 'utf8')
  const patch = readFileSync('build/proxybridge/fail-closed.patch', 'utf8')
  const processListPatch = readFileSync('build/proxybridge/process-list-capacity.patch', 'utf8')
  const router = readFileSync('build/proxybridge/kokorobox_process_router.c', 'utf8')
  assert.match(build, /02703a0672a8b94011a4698368a392f7734c10dc/)
  assert.match(build, /63cb41763bb4b20f600b6de04e991a9c2be73279e317d4d82f237b150c5f3f15/)
  assert.equal((patch.match(/return RULE_ACTION_BLOCK/g) || []).length, 4)
  assert.doesNotMatch(patch, /^\+.*return RULE_ACTION_DIRECT/m)
  assert.match(processListPatch, /MAX_PROCESS_NAME 65536/)
  assert.match(build, /process-list-capacity\.patch/)
  assert.match(build, /kokorobox-process-router\.exe/)
  assert.match(router, /version != PROTOCOL_VERSION/)
  assert.match(router, /argc != 1/)
  assert.doesNotMatch(router, /--profile|--update|WinHttp/)
  assert.match(router, /atomic replacement guard/)
  assert.match(router, /ProxyBridge_MoveRuleToPosition\(guard_id, 1\)/)
  assert.match(router, /ProxyBridge_DeleteRule\(guard_id\)/)
  assert.match(router, /read_string\(object, "executablePath"/)
  assert.doesNotMatch(router, /read_string\(object, "executableName"/)
  assert.match(router, /KokoroBox\.exe;mihomo\.exe;mihomo-alpha\.exe;sparkle-service\.exe/)
  assert.match(router, /127\.\*\.\*\.\*.*fe80::\/10/s)
  assert.match(build, /manifest\.json/)
  assert.match(build, /process-router-sbom\.cdx\.json/)
})
