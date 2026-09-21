import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  appRoutingSupported,
  appRoutingExecutableName,
  appRoutingIdentifierKind,
  executableName,
  isAppRoutingRuleEffectivelyEnabled,
  isProtectedAppRoutingPattern,
  isProtectedAppRoutingProcess,
  isProtectedLinuxExecutablePath,
  normalizeAppRoutingConfig,
  migrateMacAppRoutingIdentityKinds,
  normalizeLinuxExecutablePath,
  normalizeMacSigningIdentifier,
  normalizeWindowsExecutablePath,
  parseAppRoutingConfig,
  validateAppRoutingConfig
} from '../src/shared/app-routing'
import {
  appRoutingListenerName,
  appRoutingSocksPort,
  appRoutingTProxyPort,
  appRoutingDnsHost,
  appRoutingDnsPort,
  applyAppRoutingListener,
  protectedNetworkTargets,
  protectedProcessNames
} from '../src/main/app-routing/profile'
import { isSuccessfulSocks5Greeting } from '../src/main/app-routing/health'
import {
  macOSSystemExtensionBundleVersion,
  macOSSystemExtensionVersion,
  proxyBridgeRepository,
  proxyBridgeSourceRevision
} from '../src/main/app-routing/integrity-manifest'
import {
  buildServiceProcessRouterRules,
  validateServiceProcessRouterStatus
} from '../src/main/app-routing/service-protocol'
import {
  appRoutingGroupKey,
  connectionIdentityKey,
  connectionIdentityLabel,
  isAppRoutingConnection
} from '../src/renderer/src/components/connections/connection-identity'
import {
  buildMacAppRoutingConfiguration,
  macAppRoutingOperatingSystemSupported
} from '../src/main/app-routing/macos-profile'
import { macOSBundleVersion } from './macos-bundle-version'

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

test('gives application-routing connections a stable cross-privilege display identity', () => {
  const serviceConnection = {
    metadata: {
      process: '',
      sourceIP: '127.0.0.1',
      inboundName: 'kokorobox-app-routing',
      inboundPort: '7891',
      type: 'Socks5'
    }
  }
  assert.equal(isAppRoutingConnection(serviceConnection), true)
  assert.equal(connectionIdentityKey(serviceConnection), appRoutingGroupKey)
  assert.equal(
    connectionIdentityLabel(serviceConnection, 'Application routing'),
    'Application routing'
  )

  const legacyConnection = {
    metadata: {
      process: '',
      sourceIP: '::1',
      inboundName: '',
      inboundPort: '7891',
      type: 'Socks5'
    }
  }
  assert.equal(isAppRoutingConnection(legacyConnection), true)

  const ordinaryLoopbackConnection = {
    metadata: {
      process: '',
      sourceIP: '127.0.0.1',
      inboundName: '',
      inboundPort: '7890',
      type: 'Socks5'
    }
  }
  assert.equal(isAppRoutingConnection(ordinaryLoopbackConnection), false)
  assert.equal(connectionIdentityKey(ordinaryLoopbackConnection), '127.0.0.1')

  const resolvedConnection = {
    metadata: {
      process: 'kokorobox-process-router.exe',
      sourceIP: '127.0.0.1',
      inboundName: 'kokorobox-app-routing',
      inboundPort: '7891',
      type: 'Socks5'
    }
  }
  assert.equal(isAppRoutingConnection(resolvedConnection), true)
  assert.equal(connectionIdentityKey(resolvedConnection), appRoutingGroupKey)
  assert.equal(
    connectionIdentityLabel(resolvedConnection, 'Application routing'),
    'Application routing'
  )
})

test('application routing supports Windows x64, macOS, and Linux desktop architectures', () => {
  assert.equal(appRoutingSupported('win32', 'x64'), true)
  assert.equal(appRoutingSupported('win32', 'arm64'), false)
  assert.equal(appRoutingSupported('darwin', 'x64'), true)
  assert.equal(appRoutingSupported('darwin', 'arm64'), true)
  assert.equal(appRoutingSupported('linux', 'x64'), true)
  assert.equal(appRoutingSupported('linux', 'arm64'), true)
  assert.equal(appRoutingSupported('linux', 'ia32'), false)
  assert.equal(macAppRoutingOperatingSystemSupported('21.6.0'), false)
  assert.equal(macAppRoutingOperatingSystemSupported('22.0.0'), true)
})

test('validates canonical Linux executable paths without intercepting KokoroBox components', () => {
  const linuxRule = rule({
    processPattern: '/usr/lib/firefox/firefox',
    identifierKind: 'linux-executable',
    sourcePath: '/usr/lib/firefox/firefox'
  })
  const config: AppRoutingConfig = {
    version: 1,
    enabled: true,
    failClosed: true,
    proxyUdpDns: true,
    defaultAction: 'proxy',
    defaultProtocol: 'both',
    diagnosticLogging: false,
    rules: [linuxRule]
  }
  assert.equal(
    normalizeLinuxExecutablePath('  /usr//lib/firefox/firefox  '),
    '/usr/lib/firefox/firefox'
  )
  assert.equal(appRoutingIdentifierKind(linuxRule), 'linux-executable')
  assert.equal(appRoutingExecutableName(linuxRule.processPattern, 'linux-executable'), 'firefox')
  assert.equal(isProtectedLinuxExecutablePath('/opt/kokorobox/kokorobox'), true)
  assert.doesNotThrow(() => validateAppRoutingConfig(config))
  const serviceRules = buildServiceProcessRouterRules(config, 7894, 'linux')
  assert.equal(serviceRules.platform, 'linux')
  assert.equal(serviceRules.rules[0].executable_name, 'firefox')
  for (const processPattern of [
    'usr/bin/firefox',
    '/usr/../bin/firefox',
    '/opt/kokorobox/kokorobox',
    '/usr/bin/fire*'
  ]) {
    assert.throws(() =>
      validateAppRoutingConfig({
        ...config,
        rules: [{ ...linuxRule, processPattern, sourcePath: processPattern }]
      })
    )
  }
})

test('renderer exposes application routing everywhere the shared capability supports it', () => {
  for (const file of [
    'src/renderer/src/components/sider/sider-cards.tsx',
    'src/renderer/src/components/settings/sider-config.tsx'
  ]) {
    const source = readFileSync(resolve(file), 'utf8')
    assert.match(source, /appRoutingSupported\(window\.api\.platform, window\.api\.arch\)/)
    assert.doesNotMatch(source, /window\.api\.platform === 'win32' && window\.api\.arch === 'x64'/)
  }
})

test('application inspection and folder scans use the native bridge', () => {
  const source = readFileSync(resolve('src/main/sys/misc.ts'), 'utf8')
  assert.match(source, /inspectApplication\(selectedPath\)/)
  assert.match(
    source,
    /scanWindowsApplications\(selectedDirectory, 512, protectedAppRoutingProcessNames\(\)\)/
  )
  assert.doesNotMatch(source, /scanWindowsExecutableDirectory/)
})

test('validates typed macOS identities and translates rules atomically', () => {
  const macRule = rule({
    processPattern: 'com.openai.chat*',
    identifierKind: 'macos-signing-identifier',
    sourcePath: '/Applications/ChatGPT.app'
  })
  assert.equal(appRoutingIdentifierKind(macRule), 'macos-signing-identifier')
  assert.equal(normalizeMacSigningIdentifier('  com.openai.chat  '), 'com.openai.chat')
  const config: AppRoutingConfig = {
    version: 1,
    enabled: true,
    failClosed: true,
    proxyUdpDns: true,
    defaultAction: 'proxy',
    defaultProtocol: 'both',
    diagnosticLogging: false,
    rules: [macRule]
  }
  validateAppRoutingConfig(config)
  const macConfiguration = buildMacAppRoutingConfiguration(config, true)
  assert.deepEqual(
    {
      proxyUdpDns: macConfiguration.proxyUdpDns,
      dnsHost: macConfiguration.dnsHost,
      dnsPort: macConfiguration.dnsPort
    },
    { proxyUdpDns: true, dnsHost: '127.0.0.1', dnsPort: 7892 }
  )
  assert.deepEqual(macConfiguration.rules, [
    {
      signingIdentifier: 'com.openai.chat*',
      identifierKind: 'SIGNING_IDENTIFIER',
      ruleProtocol: 'BOTH',
      action: 'PROXY',
      enabled: true,
      priority: 1
    }
  ])
  assert.equal(buildMacAppRoutingConfiguration(config, false).rules[0].action, 'BLOCK')
  const processRule = rule({
    processPattern: 'codex',
    identifierKind: 'macos-process-name',
    sourcePath: undefined
  })
  const processConfiguration = buildMacAppRoutingConfiguration(
    { ...config, rules: [processRule] },
    true
  )
  assert.deepEqual(processConfiguration.rules[0], {
    signingIdentifier: 'codex',
    identifierKind: 'PROCESS_NAME',
    ruleProtocol: 'BOTH',
    action: 'PROXY',
    enabled: true,
    priority: 1
  })
  validateAppRoutingConfig({
    ...config,
    rules: [{ ...processRule, processPattern: 'Codex Helper*' }]
  })
  assert.throws(() =>
    validateAppRoutingConfig({
      ...config,
      rules: [{ ...processRule, processPattern: 'KokoroBox' }]
    })
  )
  for (const processPattern of ['*', 'com.example.bad?', 'com.amamiyakokoro.app']) {
    assert.throws(() =>
      validateAppRoutingConfig({
        ...config,
        rules: [{ ...macRule, processPattern }]
      })
    )
  }
  assert.throws(() => buildMacAppRoutingConfiguration({ ...config, rules: [rule()] }, true))
})

test('migrates legacy short macOS identities once without changing selected applications', () => {
  const legacy = {
    version: 1,
    enabled: true,
    failClosed: true,
    proxyUdpDns: true,
    defaultAction: 'proxy',
    defaultProtocol: 'both',
    diagnosticLogging: false,
    rules: [
      rule({
        processPattern: 'codex',
        identifierKind: 'macos-signing-identifier',
        sourcePath: undefined
      }),
      rule({
        id: 'selected',
        processPattern: 'com.openai.codex',
        identifierKind: 'macos-signing-identifier',
        sourcePath: '/Applications/Codex.app',
        priority: 2
      })
    ]
  } satisfies AppRoutingConfig
  const migrated = migrateMacAppRoutingIdentityKinds(legacy)
  assert.equal(migrated.macosIdentityKindsVersion, 1)
  assert.equal(migrated.rules[0].identifierKind, 'macos-process-name')
  assert.equal(migrated.rules[1].identifierKind, 'macos-signing-identifier')
  assert.deepEqual(migrateMacAppRoutingIdentityKinds(migrated), migrated)
})

test('validates filename and wildcard patterns while protecting internal processes', () => {
  validateAppRoutingConfig({
    version: 1,
    enabled: true,
    failClosed: true,
    proxyUdpDns: true,
    defaultAction: 'proxy',
    defaultProtocol: 'both',
    diagnosticLogging: false,
    rules: [rule()]
  })
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
      proxyUdpDns: true,
      defaultAction: 'proxy',
      defaultProtocol: 'both',
      diagnosticLogging: false,
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
      proxyUdpDns: true,
      defaultAction: 'proxy',
      defaultProtocol: 'both',
      diagnosticLogging: false,
      rules: [rule({ processPattern: 'example*.exe' })]
    })
  )
  assert.doesNotThrow(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      proxyUdpDns: true,
      defaultAction: 'proxy',
      defaultProtocol: 'both',
      diagnosticLogging: false,
      rules: [rule({ processPattern: 'C:\\Program Files\\*\\example.exe' })]
    })
  )
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      proxyUdpDns: true,
      defaultAction: 'proxy',
      defaultProtocol: 'both',
      diagnosticLogging: false,
      rules: [rule(), rule({ id: 'rule-2', priority: 2 })]
    })
  )
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      proxyUdpDns: true,
      defaultAction: 'proxy',
      defaultProtocol: 'both',
      diagnosticLogging: false,
      rules: [rule({ sourcePath: 'relative.exe' })]
    })
  )
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: true,
      proxyUdpDns: true,
      defaultAction: 'proxy',
      defaultProtocol: 'both',
      diagnosticLogging: false,
      rules: [rule({ processPattern: 'KokoroBox.exe' })]
    })
  )
  for (const processPattern of ['example?.exe', 'example.exe;other.exe', 'example.dll']) {
    assert.throws(() =>
      validateAppRoutingConfig({
        version: 1,
        enabled: true,
        failClosed: true,
        proxyUdpDns: true,
        defaultAction: 'proxy',
        defaultProtocol: 'both',
        diagnosticLogging: false,
        rules: [rule({ processPattern })]
      })
    )
  }
  assert.equal(isProtectedAppRoutingProcess('sparkle-service.exe'), true)
  assert.equal(isProtectedAppRoutingProcess('kokorobox-service.exe'), true)
  assert.equal(isProtectedAppRoutingProcess('kokorobox-desktop-windows-2.0.0-x64-setup.exe'), true)
  assert.equal(isProtectedAppRoutingPattern('kokoro*.exe'), true)
  assert.equal(isProtectedAppRoutingPattern('*.exe'), true)
  assert.throws(() =>
    validateAppRoutingConfig({
      version: 1,
      enabled: true,
      failClosed: false as true,
      proxyUdpDns: true,
      defaultAction: 'proxy',
      defaultProtocol: 'both',
      diagnosticLogging: false,
      rules: []
    })
  )
})

test('injects and removes the isolated loopback Mihomo listener', () => {
  const profile = {
    listeners: [{ name: 'user-listener', type: 'mixed', port: 7890 }]
  } as MihomoConfig
  applyAppRoutingListener(profile, true, true, 'win32')
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
  assert.deepEqual(profile.dns, {
    enable: true,
    listen: `${appRoutingDnsHost}:${appRoutingDnsPort}`
  })
  applyAppRoutingListener(profile, false, false, 'win32')
  assert.deepEqual(profile.listeners, [{ name: 'user-listener', type: 'mixed', port: 7890 }])
  assert.deepEqual(profile.dns, {
    enable: true,
    listen: `${appRoutingDnsHost}:${appRoutingDnsPort}`
  })
})

test('injects a Linux TPROXY listener without enabling TUN', () => {
  const profile = { tun: { enable: false } } as MihomoConfig
  applyAppRoutingListener(profile, true, true, 'linux')
  assert.deepEqual(profile.listeners, [
    {
      name: appRoutingListenerName,
      type: 'tproxy',
      port: appRoutingTProxyPort,
      listen: '0.0.0.0',
      udp: true
    }
  ])
  assert.equal(profile.tun.enable, false)
  assert.equal(profile.dns.listen, `${appRoutingDnsHost}:${appRoutingDnsPort}`)
})

test('requires a complete no-auth SOCKS5 handshake response', () => {
  assert.equal(isSuccessfulSocks5Greeting(Uint8Array.from([0x05, 0x00])), true)
  assert.equal(isSuccessfulSocks5Greeting(Uint8Array.from([0x05])), false)
  assert.equal(isSuccessfulSocks5Greeting(Uint8Array.from([0x05, 0xff])), false)
  assert.equal(isSuccessfulSocks5Greeting(Uint8Array.from([0x04, 0x00])), false)
})

test('generates and validates the authenticated service protocol', () => {
  const config: AppRoutingConfig = {
    version: 1,
    enabled: true,
    failClosed: true,
    proxyUdpDns: true,
    defaultAction: 'proxy',
    defaultProtocol: 'both',
    diagnosticLogging: true,
    rules: [rule()]
  }
  assert.deepEqual(buildServiceProcessRouterRules(config, 7891), {
    version: 1,
    platform: 'windows',
    proxy_port: 7891,
    fail_closed: true,
    proxy_udp_dns: true,
    diagnostic_logging: true,
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
  assert.ok(protectedProcessNames.includes('kokorobox-process-router.exe'))
  assert.ok(protectedNetworkTargets.includes('::1'))
  const status = {
    version: 1 as const,
    supported: true,
    state: 'blocked' as const,
    generation: 3,
    mihomo_available: false,
    firewall_ready: true,
    protected_application_count: 1,
    proxy_port: 7891,
    backend: 'windows-proxybridge'
  }
  assert.equal(validateServiceProcessRouterStatus(status, 'win32'), status)
  assert.throws(() => validateServiceProcessRouterStatus({ ...status, version: 2 as 1 }, 'win32'))
  assert.throws(() => validateServiceProcessRouterStatus({ ...status, proxy_port: 1080 }, 'win32'))
  assert.throws(() =>
    validateServiceProcessRouterStatus({ ...status, firewall_ready: false }, 'win32')
  )
  assert.equal(
    validateServiceProcessRouterStatus(
      { ...status, proxy_port: 7894, backend: 'linux-cgroup-v2' },
      'linux'
    ).backend,
    'linux-cgroup-v2'
  )
  assert.throws(() => validateServiceProcessRouterStatus({ ...status, proxy_port: 7891 }, 'linux'))
})

test('normalizes persisted order into unique priorities', () => {
  const normalized = normalizeAppRoutingConfig({
    version: 1,
    enabled: true,
    failClosed: true,
    proxyUdpDns: false,
    defaultAction: 'block',
    defaultProtocol: 'udp',
    diagnosticLogging: true,
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
  assert.equal(normalized.defaultAction, 'block')
  assert.equal(normalized.defaultProtocol, 'udp')
  assert.equal(normalized.diagnosticLogging, true)
})

test('rule groups preserve child state while controlling effective routing', () => {
  const groupedRule = rule({ groupId: 'games' })
  const config: AppRoutingConfig = {
    version: 1,
    enabled: true,
    failClosed: true,
    proxyUdpDns: true,
    defaultAction: 'proxy',
    defaultProtocol: 'both',
    diagnosticLogging: false,
    groups: [
      {
        id: 'games',
        name: 'Games',
        sourceDirectory: 'C:\\Games',
        enabled: false
      }
    ],
    rules: [groupedRule]
  }

  validateAppRoutingConfig(config)
  assert.equal(groupedRule.enabled, true)
  assert.equal(isAppRoutingRuleEffectivelyEnabled(config, groupedRule), false)
  assert.equal(buildServiceProcessRouterRules(config, 7891).rules[0].enabled, false)

  const manualGroupConfig: AppRoutingConfig = {
    ...config,
    groups: [{ id: 'manual', name: 'Manual group', enabled: true }],
    rules: [rule({ id: 'manual-rule', groupId: 'manual' })]
  }
  validateAppRoutingConfig(manualGroupConfig)
  assert.deepEqual(normalizeAppRoutingConfig(manualGroupConfig).groups, [
    { id: 'manual', name: 'Manual group', enabled: true }
  ])

  const enabled = { ...config, groups: [{ ...config.groups![0], enabled: true }] }
  assert.equal(isAppRoutingRuleEffectivelyEnabled(enabled, groupedRule), true)
  assert.equal(normalizeAppRoutingConfig(enabled).rules[0].groupId, 'games')
  assert.throws(() => validateAppRoutingConfig({ ...config, groups: [] }))
  assert.throws(() =>
    validateAppRoutingConfig({
      ...config,
      groups: [...config.groups!, { ...config.groups![0], id: 'duplicate' }]
    })
  )
})

test('grouped rules retain the same priority order shown by the UI', () => {
  const normalized = normalizeAppRoutingConfig({
    version: 1,
    enabled: true,
    failClosed: true,
    proxyUdpDns: true,
    defaultAction: 'proxy',
    defaultProtocol: 'both',
    diagnosticLogging: false,
    groups: [
      { id: 'tools', name: 'Tools', sourceDirectory: 'C:\\Tools', enabled: true },
      { id: 'games', name: 'Games', sourceDirectory: 'C:\\Games', enabled: true }
    ],
    rules: [
      rule({ id: 'game', processPattern: 'game.exe', groupId: 'games', priority: 1 }),
      rule({ id: 'solo', processPattern: 'solo.exe', priority: 2 }),
      rule({ id: 'tool', processPattern: 'tool.exe', groupId: 'tools', priority: 3 })
    ]
  })
  assert.deepEqual(
    normalized.rules.map((item) => [item.id, item.priority]),
    [
      ['solo', 1],
      ['tool', 2],
      ['game', 3]
    ]
  )
})

test('parses only the canonical process-pattern schema', () => {
  const parsed = parseAppRoutingConfig({
    version: 1,
    enabled: true,
    failClosed: true,
    proxyUdpDns: true,
    defaultAction: 'direct',
    defaultProtocol: 'tcp',
    diagnosticLogging: true,
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
    proxyUdpDns: true,
    defaultAction: 'direct',
    defaultProtocol: 'tcp',
    diagnosticLogging: true,
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
  assert.deepEqual(Object.keys(parsed).sort(), [
    'defaultAction',
    'defaultProtocol',
    'diagnosticLogging',
    'enabled',
    'failClosed',
    'proxyUdpDns',
    'rules',
    'version'
  ])
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
      proxyUdpDns: true,
      defaultAction: 'proxy',
      defaultProtocol: 'both',
      diagnosticLogging: false,
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

test('macOS routing packages the pinned data plane and uses the native control plane', () => {
  const sourceManifest = JSON.parse(readFileSync('build/proxybridge/source-manifest.json', 'utf8'))
  const macBuild = readFileSync('scripts/prepare-macos-routing.ts', 'utf8')
  const buildWorkflow = readFileSync('.github/workflows/build.yml', 'utf8')
  const macCoordinator = readFileSync('src/main/app-routing/macos.ts', 'utf8')
  const manager = readFileSync('src/main/app-routing/manager.ts', 'utf8')
  assert.equal(sourceManifest.proxyBridgeRepository, proxyBridgeRepository)
  assert.equal(sourceManifest.proxyBridgeRevision, proxyBridgeSourceRevision)
  assert.equal(sourceManifest.macOSSystemExtensionVersion, macOSSystemExtensionVersion)
  assert.equal(sourceManifest.macOSSystemExtensionBundleVersion, macOSSystemExtensionBundleVersion)
  assert.match(macOSSystemExtensionVersion, /^\d+\.\d+\.\d+$/)
  assert.match(macOSSystemExtensionBundleVersion, /^[1-9]\d*$/)
  assert.match(proxyBridgeRepository, /https:\/\/github\.com\/amamiyakokoro\/ProxyBridge\.git/)
  assert.match(macBuild, /proxyBridgeRepository/)
  assert.match(macBuild, /proxyBridgeSourceRevision/)
  assert.match(macBuild, /extensionBundleIdentifier = 'com\.amamiyakokoro\.app\.proxy-extension'/)
  assert.match(macBuild, /extensionBundleName = `\$\{extensionBundleIdentifier\}\.systemextension`/)
  assert.match(macBuild, /path\.join\(stagingRoot, extensionBundleName\)/)
  assert.match(macBuild, /CODE_SIGNING_ALLOWED=NO/)
  assert.match(macBuild, /MARKETING_VERSION=\$\{macOSSystemExtensionVersion\}/)
  assert.match(macBuild, /CURRENT_PROJECT_VERSION=\$\{macOSSystemExtensionBundleVersion\}/)
  assert.match(macBuild, /CURRENT_PROJECT_VERSION=/)
  assert.doesNotMatch(macBuild, /macOSBundleVersion|KOKOROBOX_BUILD_NUMBER/)
  assert.match(macBuild, /requiredExtensionMetadata/)
  assert.match(macBuild, /CFBundleIdentifier/)
  assert.match(macBuild, /CFBundleExecutable/)
  assert.match(macBuild, /CFBundlePackageType/)
  assert.match(macBuild, /CFBundleShortVersionString/)
  assert.match(macBuild, /CFBundleVersion/)
  assert.doesNotMatch(macBuild, /GENERATE_INFOPLIST_FILE=YES/)
  assert.doesNotMatch(macBuild, /node-gyp\.js|electronjs\.org\/headers|kokorobox-app-routing\.node/)
  assert.match(macBuild, /replaceKokoroBoxConfiguration/)
  assert.match(macBuild, /installKokoroBoxConfiguration/)
  assert.match(macBuild, /configuration\.proxyUdpDns/)
  assert.match(macBuild, /readAndForwardDnsUDP\(association\)/)
  assert.doesNotMatch(macBuild, /swiftc|KokoroBoxAppRoutingBridge\.swift/)
  assert.match(buildWorkflow, /pnpm prepare:macos-routing/)
  assert.doesNotMatch(buildWorkflow, /git -C .*ProxyBridge.* checkout --detach/)
  assert.doesNotMatch(buildWorkflow, /002864ff606ddeb4c6dce6dc1247596a3d317fc5/)
  assert.match(macCoordinator, /import \{ invokeMacosApplicationRouting \} from 'kokorobox-native'/)
  assert.match(macCoordinator, /invokeMacosApplicationRouting\(request\)/)
  assert.match(macCoordinator, /providerHealthCheckIntervalMs = 15_000/)
  assert.match(macCoordinator, /providerHealthCheckDue/)
  assert.match(macCoordinator, /activePolicyKey = response\.state === 'running' \? policyKey : ''/)
  assert.match(manager, /while \(reconcileRequested\)/)
  assert.match(manager, /void reconcileAppRouting\(\)/)
  assert.doesNotMatch(manager, /await reconcileAppRouting\(\)\s+monitor = setInterval/)
  assert.doesNotMatch(macCoordinator, /process\.dlopen|spawn\(|child_process/)
})

test('Windows and Linux application routing use only the privileged service lifecycle', () => {
  const manager = readFileSync('src/main/app-routing/manager.ts', 'utf8')
  const serviceProtocol = readFileSync('src/main/app-routing/service-protocol.ts', 'utf8')
  const serviceApi = readFileSync('src/main/service/api.ts', 'utf8')
  const settingsDrawer = readFileSync(
    'src/renderer/src/components/app-routing/app-routing-setting-drawer.tsx',
    'utf8'
  )
  const installer = readFileSync('build/installer.nsh', 'utf8')

  assert.match(
    manager,
    /if \(!config\.enabled \|\| enabledRules\.length === 0\)[\s\S]*await disableServiceRouter\(true\)/
  )
  assert.match(manager, /await reconcileService\(config\)/)
  assert.match(manager, /else await disableServiceRouter\(true\)/)
  assert.doesNotMatch(manager, /child_process|spawn\(|startChild|stopChild|stopDirectRouter/)
  assert.doesNotMatch(manager, /activeBackend|corePermissionMode|isRunningAsAdmin/)
  assert.doesNotMatch(manager, /verifyProcessRouterIntegrity|ensureDirectFirewall/)
  assert.match(manager, /firewallReady: serviceStatus\.firewall_ready/)
  assert.match(manager, /repairProcessRouterFirewall\(\)/)
  assert.match(serviceApi, /post\('\/process-router\/firewall\/repair'\)/)
  assert.match(settingsDrawer, /34010\/TCP and 34011\/UDP/)
  assert.doesNotMatch(settingsDrawer, /7891/)
  assert.match(manager, /message\.toLowerCase\(\)\.includes\('service is not initialized'\)/)
  assert.match(manager, /KokoroBox Service 尚未初始化，请初始化服务后重试/)
  assert.match(manager, /serviceAuthenticationBlocked = true/)
  assert.match(
    manager,
    /isServiceAuthenticationError\(error\)[\s\S]*serviceStopped = true[\s\S]*servicePolicyKey = ''[\s\S]*return/
  )
  const page = readFileSync('src/renderer/src/pages/app-routing.tsx', 'utf8')
  assert.match(page, /prepareWindowsService = async/)
  assert.match(page, /nextStatus === 'not-installed'[\s\S]*await installService\(\)/)
  assert.match(page, /nextStatus !== 'running'[\s\S]*await initService\(\)/)
  assert.match(page, /status\.message === 'KokoroBox Service 认证已失效，请在内核设置中重置认证'/)
  assert.match(page, /needsWindowsServiceRepair/)
  assert.match(page, /tr\('Repair service'\)/)
  assert.match(serviceProtocol, /typeof value\.firewall_ready !== 'boolean'/)
  assert.match(serviceProtocol, /application routing without firewall protection/)
  assert.doesNotMatch(installer, /process-router firewall/)
  assert.match(installer, /Installing and starting KokoroBox service/)
  assert.match(installer, /'"\$R1" service install'/)
  assert.doesNotMatch(installer, /'"\$R1" service start'/)
  assert.doesNotMatch(installer, /kokoroboxServiceWasRunning/)
  assert.match(installer, /customUnInstall[\s\S]*'"\$R1" service uninstall'/)
  assert.match(installer, /!macro customUnInstall/)
})

test('macOS approval guidance returns promptly and remains visible across app restarts', () => {
  const coordinator = readFileSync('src/main/app-routing/macos.ts', 'utf8')
  const page = readFileSync('src/renderer/src/pages/app-routing.tsx', 'utf8')
  const statusMessages = readFileSync('src/renderer/src/utils/app-routing-status.ts', 'utf8')
  const settingsDrawer = readFileSync(
    'src/renderer/src/components/app-routing/app-routing-setting-drawer.tsx',
    'utf8'
  )
  const hook = readFileSync('src/renderer/src/hooks/use-app-routing.ts', 'utf8')

  assert.match(page, /isPending=\{openingSettings\}/)
  assert.match(page, /notify\(error, \{ variant: 'danger' \}\)/)
  assert.match(coordinator, /invokeBridge\('open-settings'\)/)
  assert.match(coordinator, /needsUserApproval: response\.needsUserApproval/)
  assert.match(hook, /refreshAppRoutingStatus/)
  assert.match(page, /needsMacApproval/)
  assert.match(page, /Open System Settings and Request Approval/)
  assert.match(page, /I enabled it — check now/)
  assert.match(page, /isMac=\{isMac\}/)
  assert.match(page, /onOpenSystemSettings=\{\(\) => void openApprovalSettings\(\)\}/)
  assert.match(settingsDrawer, /\{isMac && \(/)
  assert.match(settingsDrawer, /macOS Network Extension/)
  assert.match(settingsDrawer, /onPress=\{onOpenSystemSettings\}/)
  assert.match(page, /getAppRoutingStatusMessage/)
  assert.match(statusMessages, /Network Extension did not acknowledge the update/)
})

test('macOS health polling does not publish a transient start status', () => {
  const manager = readFileSync('src/main/app-routing/manager.ts', 'utf8').replaceAll('\r\n', '\n')
  assert.match(manager, /function appRoutingStatusEquals/)
  assert.match(manager, /if \(appRoutingStatusEquals\(status, next\)\) return/)

  const macBranchStart = manager.indexOf(
    "if (process.platform === 'darwin') {\n    if (!config.enabled"
  )
  const macBranchEnd = manager.indexOf(
    '\n  if (!config.enabled || enabledRules.length === 0)',
    macBranchStart
  )
  assert.ok(macBranchStart >= 0 && macBranchEnd > macBranchStart)
  assert.doesNotMatch(manager.slice(macBranchStart, macBranchEnd), /state: 'starting'/)
})

test('macOS bundle versions support stable revisions and rolling builds', () => {
  assert.deepEqual(macOSBundleVersion('2.26.9-7'), {
    marketingVersion: '2.26.9',
    bundleVersion: '2.26.9007'
  })
  assert.deepEqual(macOSBundleVersion('2.26.10-rolling-2d6c507', '4321'), {
    marketingVersion: '2.26.10',
    bundleVersion: '2008643'
  })
  assert.deepEqual(macOSBundleVersion('2.26.10', '4322'), {
    marketingVersion: '2.26.10',
    bundleVersion: '2008644'
  })
  assert.equal(
    Number(macOSBundleVersion('2.26.10-rolling-2d6c507', '4321').bundleVersion),
    Number(macOSBundleVersion('2.26.9-7', '4321').bundleVersion) + 1
  )
  assert.deepEqual(macOSBundleVersion('2.27.0'), {
    marketingVersion: '2.27.0',
    bundleVersion: '2.27.0'
  })
  assert.throws(() => macOSBundleVersion('2.26.10-beta.1'), /Unsupported macOS bundle version/)
  assert.throws(() => macOSBundleVersion('2.26.10-rolling-not-a-sha'), /Unsupported macOS/)
  assert.throws(
    () => macOSBundleVersion('2.26.10-rolling-2d6c507'),
    /require a monotonic source build number/
  )
  for (const invalid of ['', '0', '01', '-1', '1000000']) {
    assert.throws(() => macOSBundleVersion('2.26.10', invalid), /source build number/)
  }
})

test('new application rules use the configured defaults', () => {
  const hook = readFileSync(
    resolve(process.cwd(), 'src/renderer/src/hooks/use-app-routing.ts'),
    'utf8'
  )
  assert.equal((hook.match(/action: config\.defaultAction/g) || []).length, 3)
  assert.equal((hook.match(/protocol: config\.defaultProtocol/g) || []).length, 3)
})

test('application routing rules use a compact identity-first list layout', () => {
  const page = readFileSync('src/renderer/src/pages/app-routing.tsx', 'utf8')
  const row = readFileSync('src/renderer/src/components/app-routing/rule-row.tsx', 'utf8')
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')

  assert.match(row, /className="app-routing-rule-row__layout"/)
  assert.match(row, /className="app-routing-rule-row__icon/)
  assert.match(row, /className="app-routing-rule-row__controls"/)
  assert.match(row, /data-has-identifier-kind=\{hasIdentifierKindSelector\}/)
  assert.match(
    row,
    /className="app-routing-rule-row__trailing"[\s\S]*<Switch[\s\S]*<KokoActionMenu/
  )
  assert.doesNotMatch(row, /grid-cols-\[2\.25rem_minmax\(0,1fr\)\]|row-span-2/)
  assert.match(row, /app-routing-default-icon\.svg\?url/)
  assert.match(row, /src=\{icon \|\| defaultApplicationIcon\}/)
  assert.doesNotMatch(page, /grid-cols-\[1fr_9rem_9rem_9rem\]/)
  assert.match(page, /scanDirectory\(\)/)
  assert.match(page, /createGroup\(name\)/)
  assert.match(page, /renameGroup\(groupEditor\.id, name\)/)
  assert.match(page, /deleteGroup\(deletingGroupId\)/)
  assert.match(page, /updateGroup\(group\.id, \{ enabled \}\)/)
  assert.match(page, /group\.sourceDirectory/)
  assert.match(page, /knownGroupIds/)
  assert.match(page, /tr\('Individual rules'\)/)
  assert.match(page, /tr\('Rule groups'\)/)
  assert.match(page, /title=\{tr\('Application routing'\)\}/)
  assert.doesNotMatch(page, /<h2[^>]*>\{tr\('Application routing'\)\}<\/h2>/)
  assert.doesNotMatch(page, /<span[^>]*>\{tr\('or'\)\}<\/span>/)
  assert.match(page, /const isProxyTrafficBlocked =/)
  assert.match(page, /isProxyTrafficBlocked \? \(/)
  assert.match(page, /className="app-routing-protection-summary"/)
  assert.match(page, /className="app-routing-rule-list" role="list"/)
  assert.match(page, /className="app-routing-group"/)
  assert.match(row, /ariaLabel=\{tr\('Rule actions'\)\}/)
  assert.match(row, /isDisabled: index === 0/)
  assert.match(row, /isDisabled: index === count - 1/)
  assert.match(row, /if \(id === 'move-up'\) onMove\(-1\)/)
  assert.match(row, /if \(id === 'move-down'\) onMove\(1\)/)
  assert.match(row, /if \(id === 'delete'\) onDelete\(\)/)
  assert.match(
    row,
    /<div className="app-routing-rule-row" data-enabled=\{rule\.enabled\} role="listitem">/
  )
  assert.doesNotMatch(row, /<Card/)
  assert.match(row, /isEditingPattern \? \(/)
  assert.match(row, /<InputGroup variant="secondary"/)
  assert.equal(row.match(/density="compact"/g)?.length, 4)
  assert.match(row, /onClick=\{\(\) => setIsEditingPattern\(true\)\}/)
  assert.match(row, /proxy: 'bg-accent'/)
  assert.match(row, /direct: 'bg-success'/)
  assert.match(row, /block: 'bg-danger'/)
  assert.match(styles, /\.app-routing-rule-list,[\s\S]*?background: var\(--surface\)/)
  assert.match(styles, /container: app-routing-rule-row \/ inline-size/)
  assert.match(
    styles,
    /\.app-routing-rule-row__layout[\s\S]*?'icon identity trailing'[\s\S]*?'icon controls controls'/
  )
  assert.match(styles, /@container app-routing-rule-row \(min-width: 48rem\)/)
  assert.match(styles, /grid-template-areas: 'icon identity controls trailing'/)
  assert.match(styles, /\.app-routing-rule-row \+ \.app-routing-rule-row/)
  assert.match(styles, /\.app-routing-rule-row\[data-enabled='false'\]/)
})

test('application rule composer uses a compact desktop toolbar workflow', () => {
  const page = readFileSync('src/renderer/src/pages/app-routing.tsx', 'utf8')
  const styles = readFileSync('src/renderer/src/assets/main.css', 'utf8')
  const overrides = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')

  assert.match(
    styles,
    /@container app-routing-rule-entry \(min-width: 30rem\)[\s\S]*grid-template-columns: minmax\(9rem, 12rem\) minmax\(0, 1fr\) auto/
  )
  const examplePosition = page.indexOf('className="app-routing-rule-example')
  const entryGridPosition = page.indexOf('className={`app-routing-rule-entry-grid')
  const actionsPosition = page.indexOf('className="app-routing-rule-actions"')
  const entryGridEndPosition = page.indexOf('</section>', entryGridPosition)
  assert.ok(examplePosition > entryGridPosition)
  assert.ok(actionsPosition > entryGridPosition)
  assert.ok(actionsPosition < entryGridEndPosition)
  assert.match(styles, /\.app-routing-rule-entry-grid \{[^}]*align-items: center/)
  assert.doesNotMatch(styles, /\.app-routing-composer-(?:field|label)/)
  assert.match(overrides, /\.app-routing-rule-composer/)
  assert.doesNotMatch(overrides, /\.app-routing-rule-composer \{[^}]*border:/)
  assert.match(page, /<KokoTextField/)
  assert.match(page, /density="toolbar"/)
  assert.match(page, /size="sm"[\s\S]*variant="secondary"[\s\S]*tr\('Select applications'\)/)
  assert.match(page, /size="sm"[\s\S]*variant="primary"[\s\S]*tr\('Add pattern rule'\)/)
  assert.match(
    page,
    /if \(event\.key === 'Enter' && processPattern\.trim\(\)\) void submitPattern\(\)/
  )
  assert.match(page, /className="flex w-full max-w-6xl flex-col gap-4 p-4"/)
  assert.doesNotMatch(page, /mx-auto flex w-full max-w-5xl/)
})

test('application routing status and Windows groups retain compact semantic structure', () => {
  const page = readFileSync('src/renderer/src/pages/app-routing.tsx', 'utf8')
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')

  assert.match(page, /<section className="app-routing-status-strip" aria-live="polite">/)
  assert.match(page, /getAppRoutingStatusLabel\(status\)/)
  assert.match(page, /displayedProxyProtocol\} · 127\.0\.0\.1:\{displayedProxyPort\}/)
  assert.match(page, /aria-label=\{tr\('Application routing'\)\}/)
  assert.match(styles, /\.app-routing-status-strip/)
  assert.match(page, /className="app-routing-group-header"/)
  assert.match(page, /aria-expanded=\{!isCollapsed\}/)
  assert.match(page, /onClick=\{\(\) => toggleGroup\(group\.id\)\}/)
  assert.match(styles, /\.app-routing-group-header/)
  assert.match(styles, /\.app-routing-group-header\[data-enabled='false'\]/)
  assert.match(styles, /\.app-routing-group-rules/)
  assert.match(styles, /\.app-routing-protection-summary/)
})

test('Windows packaging consumes the service-owned process router payload', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>
  }
  const prepare = readFileSync('scripts/prepare.ts', 'utf8')
  const serviceAssets = readFileSync('scripts/kokorobox-service.ts', 'utf8')
  const workflow = readFileSync('.github/workflows/build.yml', 'utf8')
  const sourceManifest = JSON.parse(readFileSync('build/proxybridge/source-manifest.json', 'utf8'))

  assert.doesNotMatch(packageJson.scripts['build:win'], /prepare:windows-routing/)
  assert.doesNotMatch(packageJson.scripts['build:win'], /auto-elevate|manual-elevation/)
  assert.equal(packageJson.scripts['prepare:windows-routing'], undefined)
  assert.match(prepare, /asset\.processRouter/)
  assert.match(serviceAssets, /Unexpected files in KokoroBox Service Process Router bundle/)
  assert.equal(sourceManifest.winDivertVersion, undefined)
  assert.equal(sourceManifest.winDivertArchiveSha256, undefined)
  assert.doesNotMatch(workflow, /Build Windows x64 Application Routing Sidecar/)
  assert.doesNotMatch(workflow, /build-proxybridge\.ps1/)
})
