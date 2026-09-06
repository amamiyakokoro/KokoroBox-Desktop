import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  appRoutingSupported,
  executableName,
  isProtectedAppRoutingPattern,
  isProtectedAppRoutingProcess,
  normalizeAppRoutingConfig,
  normalizeWindowsExecutablePath,
  parseAppRoutingConfig,
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
    processPattern: 'example.exe',
    sourcePath: 'C:\\Program Files\\Example\\example.exe',
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

test('validates filename and wildcard patterns while protecting internal processes', () => {
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
      rules: [
        rule(),
        rule({
          id: 'rule-2',
          processPattern: 'D:\\Other\\example.exe',
          sourcePath: 'D:\\Other\\example.exe',
          priority: 2
        })
      ]
    })
  )
  assert.doesNotThrow(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      rules: [rule({ processPattern: 'example*.exe' })]
    })
  )
  assert.doesNotThrow(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      rules: [rule({ processPattern: 'C:\\Program Files\\*\\example.exe' })]
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
      rules: [rule({ sourcePath: 'relative.exe' })]
    })
  )
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      rules: [rule({ processPattern: 'KokoroBox.exe' })]
    })
  )
  for (const processPattern of ['example?.exe', 'example.exe;other.exe', 'example.dll']) {
    assert.throws(() =>
      validateAppRoutingConfig({
        version: 1,
        enabled: true,
        failClosed: true,
        rules: [rule({ processPattern })]
      })
    )
  }
  assert.equal(isProtectedAppRoutingProcess('sparkle-service.exe'), true)
  assert.equal(isProtectedAppRoutingProcess('kokorobox-desktop-windows-2.0.0-x64-setup.exe'), true)
  assert.equal(isProtectedAppRoutingPattern('kokoro*.exe'), true)
  assert.equal(isProtectedAppRoutingPattern('*.exe'), true)
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
        processPattern: 'blocked*.exe',
        sourcePath: 'D:\\Tools\\blocked.exe',
        action: 'block',
        protocol: 'udp',
        priority: 2
      }),
      rule({
        id: 'rule-3',
        processPattern: '\\\\server\\apps\\*\\direct.exe',
        sourcePath: '\\\\server\\apps\\direct.exe',
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
      item.processPattern,
      item.action,
      item.protocol,
      item.enabled,
      item.priority
    ]),
    [
      ['example.exe', 'PROXY', 'BOTH', true, 1],
      ['blocked*.exe', 'BLOCK', 'UDP', true, 2],
      ['\\\\server\\apps\\*\\direct.exe', 'DIRECT', 'TCP', false, 3]
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
        executable_path: 'example.exe',
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
      rule({ id: 'second', processPattern: 'b.exe', sourcePath: 'C:\\b.exe', priority: 10 })
    ]
  })
  assert.deepEqual(
    normalized.rules.map((item) => [item.processPattern, item.priority]),
    [
      ['b.exe', 1],
      ['example.exe', 2]
    ]
  )
})

test('parses only the canonical process-pattern schema', () => {
  const parsed = parseAppRoutingConfig({
    version: 1,
    enabled: true,
    failClosed: true,
    rules: [
      {
        id: 'current',
        processPattern: 'client*.exe',
        sourcePath: 'C:\\Apps\\client.exe',
        protocol: 'tcp',
        action: 'proxy',
        enabled: true,
        priority: 1
      }
    ]
  })
  assert.deepEqual(parsed, {
    version: 1,
    enabled: true,
    failClosed: true,
    rules: [
      {
        id: 'current',
        enabled: true,
        priority: 1,
        processPattern: 'client*.exe',
        sourcePath: 'C:\\Apps\\client.exe',
        protocol: 'tcp',
        action: 'proxy'
      }
    ]
  })
  assert.deepEqual(Object.keys(parsed).sort(), ['enabled', 'failClosed', 'rules', 'version'])
  assert.deepEqual(Object.keys(parsed.rules[0]).sort(), [
    'action',
    'enabled',
    'id',
    'priority',
    'processPattern',
    'protocol',
    'sourcePath'
  ])
  assert.throws(() =>
    parseAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      rules: [
        {
          id: 'old',
          executablePath: 'C:\\Apps\\client.exe',
          executableName: 'client.exe',
          protocol: 'both',
          action: 'proxy',
          enabled: true,
          priority: 1
        }
      ]
    })
  )
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

test('native build is pinned to the controlled KokoroBox ProxyBridge fork', () => {
  const build = readFileSync('scripts/build-proxybridge.ps1', 'utf8')
  const router = readFileSync('build/proxybridge/kokorobox_process_router.c', 'utf8')
  assert.match(build, /https:\/\/github\.com\/amamiyakokoro\/ProxyBridge\.git/)
  assert.match(build, /4c2de905b12cf739f07453de3c0e8ce0361d198d/)
  assert.match(build, /63cb41763bb4b20f600b6de04e991a9c2be73279e317d4d82f237b150c5f3f15/)
  assert.doesNotMatch(build, /git -C \$SourceRoot apply/)
  assert.match(build, /kokorobox-process-router\.exe/)
  assert.match(router, /version != PROTOCOL_VERSION/)
  assert.match(router, /argc != 1/)
  assert.doesNotMatch(router, /--profile|--update|WinHttp/)
  assert.match(router, /atomic replacement guard/)
  assert.match(router, /ProxyBridge_MoveRuleToPosition\(guard_id, 1\)/)
  assert.match(router, /ProxyBridge_DeleteRule\(guard_id\)/)
  assert.match(router, /read_string\(object, "processPattern"/)
  assert.doesNotMatch(router, /read_string\(object, "executablePath"/)
  assert.match(router, /KokoroBox\.exe;mihomo\.exe;mihomo-alpha\.exe;sparkle-service\.exe/)
  assert.match(router, /127\.\*\.\*\.\*.*fe80::\/10/s)
  assert.match(build, /manifest\.json/)
  assert.match(build, /process-router-sbom\.cdx\.json/)
})

test('Windows packaging rebuilds the architecture-matched process router payload', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>
  }
  const prepare = readFileSync('scripts/prepare-windows-routing.ts', 'utf8')
  const workflow = readFileSync('.github/workflows/build.yml', 'utf8')

  assert.match(packageJson.scripts['build:win'], /^pnpm run prepare:windows-routing &&/)
  assert.match(packageJson.scripts['prepare:windows-routing'], /prepare-windows-routing\.ts/)
  assert.match(prepare, /npm_config_target_arch \|\| process\.arch/)
  assert.match(prepare, /targetArch !== 'x64'/)
  assert.match(prepare, /'pwsh\.exe'/)
  assert.match(prepare, /build-proxybridge\.ps1/)
  assert.doesNotMatch(workflow, /Build Windows x64 Application Routing Sidecar/)
})
