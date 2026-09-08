import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  appRoutingSupported,
  appRoutingIdentifierKind,
  executableName,
  isProtectedAppRoutingPattern,
  isProtectedAppRoutingProcess,
  normalizeAppRoutingConfig,
  normalizeMacSigningIdentifier,
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
  proxyBridgeRepository,
  proxyBridgeSourceRevision,
  validateProcessRouterManifest,
  winDivertArchiveSha256,
  winDivertVersion
} from '../src/main/app-routing/integrity-manifest'
import {
  buildServiceProcessRouterRules,
  validateServiceProcessRouterStatus
} from '../src/main/app-routing/service-protocol'
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

test('application routing supports Windows x64 and both macOS architectures', () => {
  assert.equal(appRoutingSupported('win32', 'x64'), true)
  assert.equal(appRoutingSupported('win32', 'arm64'), false)
  assert.equal(appRoutingSupported('darwin', 'x64'), true)
  assert.equal(appRoutingSupported('darwin', 'arm64'), true)
  assert.equal(appRoutingSupported('linux', 'x64'), false)
  assert.equal(macAppRoutingOperatingSystemSupported('21.6.0'), false)
  assert.equal(macAppRoutingOperatingSystemSupported('22.0.0'), true)
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

test('validates macOS signing identifiers and translates rules atomically', () => {
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
  assert.deepEqual(buildMacAppRoutingConfiguration(config, true).rules, [
    {
      signingIdentifier: 'com.openai.chat*',
      ruleProtocol: 'BOTH',
      action: 'PROXY',
      enabled: true,
      priority: 1
    }
  ])
  assert.equal(buildMacAppRoutingConfiguration(config, false).rules[0].action, 'BLOCK')
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
    proxyUdpDns: true,
    defaultAction: 'direct',
    defaultProtocol: 'tcp',
    diagnosticLogging: true,
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
  assert.equal(command.proxyUdpDns, true)
  assert.equal(command.diagnosticLogging, true)
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
    proxyUdpDns: true,
    defaultAction: 'proxy',
    defaultProtocol: 'both',
    diagnosticLogging: true,
    rules: [rule()]
  }
  assert.deepEqual(buildServiceProcessRouterRules(config, 7891), {
    version: 1,
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
  const sourceManifest = JSON.parse(readFileSync('build/proxybridge/source-manifest.json', 'utf8'))
  const build = readFileSync('scripts/build-proxybridge.ps1', 'utf8')
  const macBuild = readFileSync('scripts/prepare-macos-routing.ts', 'utf8')
  const buildWorkflow = readFileSync('.github/workflows/build.yml', 'utf8')
  const macBridge = readFileSync('native/macos-app-routing/KokoroBoxAppRoutingBridge.mm', 'utf8')
  const macCoordinator = readFileSync('src/main/app-routing/macos.ts', 'utf8')
  const manager = readFileSync('src/main/app-routing/manager.ts', 'utf8')
  const router = readFileSync('build/proxybridge/kokorobox_process_router.c', 'utf8')
  assert.equal(sourceManifest.proxyBridgeRepository, proxyBridgeRepository)
  assert.equal(sourceManifest.proxyBridgeRevision, proxyBridgeSourceRevision)
  assert.equal(sourceManifest.winDivertVersion, winDivertVersion)
  assert.equal(sourceManifest.winDivertArchiveSha256, winDivertArchiveSha256)
  assert.match(proxyBridgeRepository, /https:\/\/github\.com\/amamiyakokoro\/ProxyBridge\.git/)
  assert.match(build, /build\/proxybridge\/source-manifest\.json/)
  assert.match(build, /SourceManifest\.proxyBridgeRevision/)
  assert.match(macBuild, /proxyBridgeRepository/)
  assert.match(macBuild, /proxyBridgeSourceRevision/)
  assert.match(macBuild, /extensionBundleIdentifier = 'com\.amamiyakokoro\.app\.proxy-extension'/)
  assert.match(macBuild, /extensionBundleName = `\$\{extensionBundleIdentifier\}\.systemextension`/)
  assert.match(macBuild, /path\.join\(stagingRoot, extensionBundleName\)/)
  assert.match(macBuild, /CODE_SIGNING_ALLOWED=NO/)
  assert.match(macBuild, /CURRENT_PROJECT_VERSION=/)
  assert.match(macBuild, /node-gyp\.js/)
  assert.match(macBuild, /electronjs\.org\/headers/)
  assert.match(macBuild, /kokorobox-app-routing\.node/)
  assert.match(macBuild, /DispatchSource\.makeTimerSource/)
  assert.match(macBuild, /lastKokoroBoxPolicyRevision/)
  assert.doesNotMatch(macBuild, /swiftc|KokoroBoxAppRoutingBridge\.swift/)
  assert.match(buildWorkflow, /pnpm prepare:macos-routing/)
  assert.doesNotMatch(buildWorkflow, /git -C .*ProxyBridge.* checkout --detach/)
  assert.doesNotMatch(buildWorkflow, /002864ff606ddeb4c6dce6dc1247596a3d317fc5/)
  assert.match(macBridge, /NAPI_MODULE/)
  assert.match(macBridge, /napi_create_async_work/)
  assert.match(macBridge, /OSSystemExtensionRequest/)
  assert.match(macBridge, /NETransparentProxyManager/)
  assert.match(macBridge, /const NSUInteger maximumAttempts = 3/)
  assert.match(macBridge, /The network extension rejected the application-routing policy/)
  assert.match(
    macBridge,
    /The network extension did not acknowledge the application-routing policy/
  )
  assert.match(macBridge, /containerURLForSecurityApplicationGroupIdentifier/)
  assert.match(macBridge, /CFNotificationCenterPostNotification/)
  assert.match(macBridge, /application-routing-policy-ack\.json/)
  assert.match(macBridge, /@"revision" : revision/)
  assert.match(macBridge, /activationRequestForExtension:KBExtensionIdentifier/)
  assert.match(macBridge, /queue:dispatch_get_main_queue\(\)/)
  assert.match(macBridge, /openApplicationAtURL:settingsURL/)
  assert.doesNotMatch(macBridge, /x-apple\.systempreferences|x-help-action/)
  assert.match(macBridge, /KBStoredConfiguration/)
  assert.match(macBridge, /KBClearSharedPolicy/)
  assert.match(macBridge, /isEqualToDictionary:configuration/)
  assert.match(macCoordinator, /\['starting', 'running'\]\.includes\(response\.state\)/)
  assert.match(manager, /while \(reconcileRequested\)/)
  assert.match(manager, /void reconcileAppRouting\(\)/)
  assert.doesNotMatch(manager, /await reconcileAppRouting\(\)\s+monitor = setInterval/)
  assert.doesNotMatch(macBridge, /SecCodeCheckValidity|certificate leaf/)
  assert.match(macCoordinator, /process\.dlopen/)
  assert.doesNotMatch(macCoordinator, /spawn\(|child_process/)
  assert.match(build, /SourceManifest\.winDivertArchiveSha256/)
  assert.doesNotMatch(build, /git -C \$SourceRoot apply/)
  assert.match(build, /kokorobox-process-router\.exe/)
  assert.match(router, /version != PROTOCOL_VERSION/)
  assert.match(router, /argc != 1/)
  assert.doesNotMatch(router, /--profile|--update|WinHttp/)
  assert.match(router, /atomic replacement guard/)
  assert.match(router, /ProxyBridge_MoveRuleToPosition\(guard_id, 1\)/)
  assert.match(router, /ProxyBridge_DeleteRule\(guard_id\)/)
  assert.match(router, /read_string\(object, "processPattern"/)
  assert.match(router, /read_bool\(command, "proxyUdpDns"/)
  assert.match(router, /ProxyBridge_SetProxyUdpDnsEnabled\(proxy_udp_dns\)/)
  assert.match(router, /read_bool\(command, "diagnosticLogging"/)
  assert.match(router, /ProxyBridge_SetConnectionCallback\(diagnostic_connection\)/)
  assert.doesNotMatch(router, /read_string\(object, "executablePath"/)
  assert.match(
    router,
    /KokoroBox\.exe;mihomo\.exe;mihomo-alpha\.exe;kokorobox-service\.exe;sparkle-service\.exe/
  )
  assert.match(router, /127\.\*\.\*\.\*.*fe80::\/10/s)
  assert.match(build, /manifest\.json/)
  assert.match(build, /process-router-sbom\.cdx\.json/)
})

test('macOS approval guidance returns promptly and remains visible across app restarts', () => {
  const bridge = readFileSync('native/macos-app-routing/KokoroBoxAppRoutingBridge.mm', 'utf8')
  const coordinator = readFileSync('src/main/app-routing/macos.ts', 'utf8')
  const page = readFileSync('src/renderer/src/pages/app-routing.tsx', 'utf8')
  const hook = readFileSync('src/renderer/src/hooks/use-app-routing.ts', 'utf8')

  assert.match(bridge, /KBUserApprovalPendingDefaultsKey/)
  assert.match(bridge, /- \(void\)requestNeedsUserApproval[\s\S]*?\[self signalOnce\]/)
  assert.match(bridge, /state = needsUserApproval \? @"starting" : KBApply/)
  assert.match(bridge, /queue:dispatch_get_main_queue\(\)/)
  assert.match(bridge, /KBOpenSystemSettings\(\)/)
  assert.match(bridge, /needsUserApproval = KBUserApprovalPending\(\)/)
  assert.match(coordinator, /needsUserApproval: response\.needsUserApproval/)
  assert.match(hook, /refreshAppRoutingStatus/)
  assert.match(page, /needsMacApproval/)
  assert.match(page, /打开系统设置并请求批准/)
  assert.match(page, /我已启用，立即检查/)
  assert.match(page, /网络扩展正在启动，请稍后重试/)
})

test('macOS health polling does not publish a transient start status', () => {
  const manager = readFileSync('src/main/app-routing/manager.ts', 'utf8')
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
  assert.deepEqual(macOSBundleVersion('2.26.10-rolling-2d6c507'), {
    marketingVersion: '2.26.10',
    bundleVersion: '2.26.10575'
  })
  assert.deepEqual(macOSBundleVersion('2.27.0'), {
    marketingVersion: '2.27.0',
    bundleVersion: '2.27.0'
  })
  assert.throws(() => macOSBundleVersion('2.26.10-beta.1'), /Unsupported macOS bundle version/)
  assert.throws(() => macOSBundleVersion('2.26.10-rolling-not-a-sha'), /Unsupported macOS/)
})

test('new application rules use the configured defaults', () => {
  const hook = readFileSync(
    resolve(process.cwd(), 'src/renderer/src/hooks/use-app-routing.ts'),
    'utf8'
  )
  assert.equal((hook.match(/action: config\.defaultAction/g) || []).length, 2)
  assert.equal((hook.match(/protocol: config\.defaultProtocol/g) || []).length, 2)
})

test('application routing rules use a two-line identity-first card layout', () => {
  const page = readFileSync('src/renderer/src/pages/app-routing.tsx', 'utf8')
  const row = readFileSync('src/renderer/src/components/app-routing/rule-row.tsx', 'utf8')

  assert.match(row, /grid-cols-\[2\.75rem_minmax\(0,1fr\)\]/)
  assert.match(row, /row-span-2/)
  assert.match(row, /border-t border-divider\/70 pt-2/)
  assert.match(row, /content=\{rule\.processPattern\}/)
  assert.match(row, /content=\{rule\.sourcePath\}/)
  assert.doesNotMatch(page, /grid-cols-\[1fr_9rem_9rem_9rem\]/)
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
