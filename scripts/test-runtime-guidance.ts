import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { isAppRoutingRuleEffectivelyEnabled } from '../src/shared/app-routing'
import { proxyRuntimeDiagnosticsFailure } from '../src/shared/proxy-diagnostics-contract'
import {
  applyRecoveryPreferences,
  buildRuntimeRecoveryGuidance,
  type RuntimeRecoverySnapshot
} from '../src/shared/runtime-recovery'
import type { SystemProxyDiagnostics } from '../src/shared/system-proxy-diagnostics'

function snapshot(patch: Partial<RuntimeRecoverySnapshot> = {}): RuntimeRecoverySnapshot {
  return {
    checkedAt: '2026-10-14T00:00:00Z',
    platform: 'darwin',
    service: 'not-installed',
    serviceRequired: false,
    coreMode: 'direct',
    core: 'running',
    proxy: { required: false, port: 7890, available: true },
    routing: {
      enabled: true,
      hasRules: true,
      requiresProxy: true,
      status: { supported: true, state: 'running', mihomoAvailable: true }
    },
    ...patch
  }
}
function routingStatus(
  status: Partial<AppRoutingStatus>,
  patch: Partial<RuntimeRecoverySnapshot> = {}
) {
  const value = snapshot(patch)
  value.routing = { ...value.routing, status: { ...value.routing.status, ...status } }
  return buildRuntimeRecoveryGuidance(value)
}
function diagnostics(kind: SystemProxyDiagnostics['overall']['kind']): SystemProxyDiagnostics {
  return {
    checkedAt: '2026-10-13T00:00:00Z',
    overall: { kind, status: 'error', summary: kind },
    state: {
      coreRunning: true,
      intentEnabled: true,
      enabled: true,
      matchesExpectedConfig: true,
      listenerAvailable: true,
      connectivityAvailable: false
    },
    results: [],
    report: ''
  }
}

test('degraded macOS routing distinguishes an active extension from its unavailable endpoint', () => {
  const result = routingStatus({
    state: 'degraded',
    mihomoAvailable: false,
    needsUserApproval: false
  })
  assert.equal(result.issue?.cause, 'routing-endpoint')
  assert.equal(result.issue?.actions[0], 'restart-core')
  assert.ok(!result.issue?.actions.includes('open-extension-settings'))
  assert.equal(result.layers.find((row) => row.id === 'routing')?.label, 'Running')
  assert.equal(result.layers.find((row) => row.id === 'routing-endpoint')?.label, 'Unavailable')
})

test('only explicit extension approval evidence opens network extension settings', () => {
  const result = routingStatus({ state: 'starting', needsUserApproval: true })
  assert.equal(result.issue?.cause, 'extension-approval')
  assert.deepEqual(result.issue?.actions, ['open-extension-settings', 'check-again'])
  assert.equal(
    routingStatus({ state: 'error', needsUserApproval: false }).issue?.cause,
    'routing-unconfirmed'
  )
  const value = snapshot()
  value.routing.enabled = false
  value.routing.status.needsUserApproval = true
  assert.equal(buildRuntimeRecoveryGuidance(value).issue, undefined)
})

test('service background approval and extension approval have separate recovery actions', () => {
  const result = buildRuntimeRecoveryGuidance(
    snapshot({
      serviceRequired: true,
      service: 'requires-approval',
      coreMode: 'service',
      core: 'unknown'
    })
  )
  assert.equal(result.issue?.cause, 'service-approval')
  assert.deepEqual(result.issue?.actions, ['open-service-settings', 'check-again'])
})

test('a running service with expired authentication repairs authentication before core restart', () => {
  const result = buildRuntimeRecoveryGuidance(
    snapshot({
      serviceRequired: true,
      service: 'running',
      coreMode: 'service',
      core: 'unknown',
      readError: 'service-authentication-required'
    })
  )
  assert.equal(result.issue?.cause, 'service-authentication')
  assert.equal(result.issue?.actions[0], 'repair-service')
  assert.equal(result.layers[0].label, 'Authentication required')
  const route = routingStatus({
    state: 'error',
    message: 'KokoroBox Service 认证已失效，请在内核设置中重置认证'
  })
  assert.equal(route.issue?.cause, 'service-authentication')
})

for (const service of ['not-installed', 'stopped', 'paused', 'need-init'] as const) {
  test(`required service ${service} offers explicit service repair`, () => {
    const result = buildRuntimeRecoveryGuidance(
      snapshot({ service, serviceRequired: true, core: 'unknown' })
    )
    assert.equal(result.issue?.actions[0], 'repair-service')
  })
}

test('macOS native routing does not require an unused privileged service', () => {
  const result = buildRuntimeRecoveryGuidance(snapshot())
  assert.equal(result.layers[0].label, 'Not required for this configuration')
  assert.equal(result.issue, undefined)
})

test('confirmed core stop, unready controller and unknown runtime give different suggestions', () => {
  const stopped = buildRuntimeRecoveryGuidance(snapshot({ core: 'stopped' }))
  assert.equal(stopped.issue?.cause, 'core-stopped')
  assert.equal(stopped.issue?.actions[0], 'start-core')
  const unready = buildRuntimeRecoveryGuidance(snapshot({ core: 'not-ready' }))
  assert.equal(unready.issue?.cause, 'core-not-ready')
  assert.equal(unready.issue?.actions[0], 'open-core-settings')
  const unknown = routingStatus({ state: 'degraded', mihomoAvailable: false }, { core: 'unknown' })
  assert.equal(unknown.issue?.cause, 'runtime-unknown')
  assert.equal(unknown.issue?.actions[0], 'run-diagnostics')
  assert.ok(!unknown.issue?.actions.includes('restart-core'))
})

test('failed configuration remains visible even while the previous core is running', () => {
  const result = buildRuntimeRecoveryGuidance(snapshot({ coreError: 'core-config-failed' }))
  assert.equal(result.issue?.cause, 'core-configuration')
  assert.deepEqual(result.issue?.actions, ['open-profiles', 'view-logs', 'check-again'])
  assert.equal(result.layers.find((row) => row.id === 'core')?.label, 'Settings not applied')
  assert.equal(result.layers.find((row) => row.id === 'core')?.state, 'warning')
})

test('missing extensions and unsupported routing do not request reapproval', () => {
  const missing = routingStatus({
    state: 'error',
    message: 'macOS application-routing system extension is not installed'
  })
  assert.equal(missing.issue?.cause, 'extension-missing')
  assert.equal(missing.issue?.actions[0], 'open-app-settings')
  assert.equal(
    routingStatus({ supported: false, state: 'error' }).issue?.cause,
    'routing-unsupported'
  )
})

test('direct-only application routing works without a core proxy endpoint', () => {
  const value = snapshot({ core: 'stopped' })
  value.routing.requiresProxy = false
  value.routing.status.mihomoAvailable = false
  const result = buildRuntimeRecoveryGuidance(value)
  assert.equal(result.issue, undefined)
  assert.equal(
    result.layers.find((row) => row.id === 'routing-endpoint')?.label,
    'Not required for this configuration'
  )
})

test('a disabled rule group does not require a proxy or a non-macOS service', () => {
  const value = snapshot({ platform: 'win32' })
  const config = {
    enabled: true,
    groups: [{ id: 'disabled', enabled: false }],
    rules: [{ id: 'rule', enabled: true, groupId: 'disabled', action: 'proxy' }]
  } as AppRoutingConfig
  const app = { corePermissionMode: 'elevated', sysProxy: { enable: false } } as AppConfig
  const applied = applyRecoveryPreferences(value, app, config)
  assert.equal(applied.routing.requiresProxy, false)
  assert.equal(applied.routing.hasRules, false)
  assert.equal(applied.serviceRequired, false)
  assert.equal(buildRuntimeRecoveryGuidance(applied).issue?.cause, 'routing-rules')
})

test('switching core ownership discards observations and failures from the previous owner', () => {
  const value = snapshot({
    coreMode: 'service',
    serviceRequired: true,
    coreError: 'core-start-failed',
    readError: 'service-authentication-required'
  })
  const result = applyRecoveryPreferences(value, {
    corePermissionMode: 'elevated',
    sysProxy: { enable: false }
  } as AppConfig)
  assert.equal(result.core, 'unknown')
  assert.equal(result.coreError, undefined)
  assert.equal(result.readError, undefined)
  assert.equal(result.proxy.available, null)
  assert.equal(buildRuntimeRecoveryGuidance(result).issue?.cause, 'runtime-unknown')
})

test('core HTTP/mixed listener and application-routing endpoint are checked independently', () => {
  const noListener = buildRuntimeRecoveryGuidance(
    snapshot({
      proxy: { required: true, port: null, available: false }
    })
  )
  assert.equal(noListener.issue?.cause, 'proxy-configuration')
  assert.equal(noListener.issue?.actions[0], 'open-core-settings')
  assert.equal(noListener.layers.find((row) => row.id === 'routing-endpoint')?.label, 'Available')
})

test('Windows firewall errors offer firewall repair instead of extension approval', () => {
  const result = routingStatus(
    { state: 'error', message: 'application-routing firewall unavailable' },
    { platform: 'win32' }
  )
  assert.equal(result.issue?.cause, 'routing-firewall')
  assert.equal(result.issue?.actions[0], 'repair-firewall')
})

test('DNS repair is offered only with a repairable diagnostic result', () => {
  const diagnostic = diagnostics('dns-failed')
  let result = buildRuntimeRecoveryGuidance(snapshot(), { diagnostics: diagnostic })
  assert.deepEqual(result.issue?.actions, ['run-diagnostics', 'view-logs'])
  diagnostic.results.push({
    id: 'dns',
    title: 'DNS',
    status: 'error',
    summary: 'failed',
    action: 'restore-bootstrap-dns'
  })
  result = buildRuntimeRecoveryGuidance(snapshot(), { diagnostics: diagnostic })
  assert.equal(result.issue?.actions[0], 'restore-bootstrap-dns')
})

test('historical diagnostic runtime facts cannot override the current core snapshot', () => {
  const diagnostic = diagnostics('healthy')
  diagnostic.state.coreRunning = false
  assert.equal(
    buildRuntimeRecoveryGuidance(snapshot(), { diagnostics: diagnostic }).issue,
    undefined
  )
  diagnostic.state.coreRunning = true
  assert.equal(
    buildRuntimeRecoveryGuidance(snapshot({ core: 'not-ready' }), { diagnostics: diagnostic }).issue
      ?.cause,
    'core-not-ready'
  )
})

test('diagnostic service-management disclosure is retained for an explicit core repair', () => {
  const diagnostic = diagnostics('core-unavailable')
  diagnostic.results.push({
    id: 'core',
    title: 'core',
    status: 'error',
    summary: 'stopped',
    action: 'start-core',
    actionHint: 'This action switches the core to Service management.'
  })
  const result = buildRuntimeRecoveryGuidance(snapshot({ core: 'stopped' }), {
    diagnostics: diagnostic
  })
  assert.equal(result.issue?.actionHint, diagnostic.results[0].actionHint)
})

test('a saved service repair prioritizes completing the requested restart', () => {
  const result = buildRuntimeRecoveryGuidance(snapshot({ core: 'unknown' }), {
    restartRequired: true
  })
  assert.deepEqual(result.issue?.actions, ['restart-app'])
})

// Execute the production snapshot reader with OS and service boundaries isolated.
function reader({
  platform = 'darwin',
  app = { corePermissionMode: 'elevated', sysProxy: { enable: false } } as AppConfig,
  runtime = async (): Promise<{
    core: { running: boolean | null; ready: boolean }
    proxy: { port: number | null }
    listener: { available: boolean }
  }> => ({
    core: { running: true, ready: true },
    proxy: { port: 7890 },
    listener: { available: true }
  }),
  service = async () => 'running',
  config = async () => ({ enabled: true, rules: [{ enabled: true, action: 'proxy' }], groups: [] })
} = {}) {
  const compiled = ts.transpileModule(readFileSync('src/main/sys/runtime-recovery.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const calls: unknown[][] = []
  const serviceCalls: unknown[][] = []
  const modules = {
    '../config/app': { getAppConfig: async () => app },
    '../app-routing/config': { getAppRoutingConfig: config },
    '../app-routing/manager': {
      getAppRoutingStatus: () => ({ supported: true, state: 'running', mihomoAvailable: true })
    },
    '../../shared/app-routing': { isAppRoutingRuleEffectivelyEnabled },
    '../service/manager': {
      serviceStatus: (...args: unknown[]) => {
        serviceCalls.push(args)
        return service()
      }
    },
    '../service/api': {
      getProxyRuntimeDiagnostics: (...args: unknown[]) => {
        calls.push(args)
        return runtime()
      }
    },
    '../../shared/proxy-diagnostics-contract': { proxyRuntimeDiagnosticsFailure }
  }
  const operation = new Function(
    'require',
    'process',
    `const exports = {}; ${compiled}; return exports.getRuntimeRecoverySnapshot;`
  )(
    (name: keyof typeof modules) => {
      assert.ok(modules[name], `Unexpected boundary: ${name}`)
      return modules[name]
    },
    { platform }
  ) as () => Promise<RuntimeRecoverySnapshot>
  return { operation, calls, serviceCalls }
}

test('snapshot reads share a pending request and suppress outbound diagnostic probes', async () => {
  let finish!: () => void
  const blocked = new Promise<void>((resolve) => {
    finish = resolve
  })
  const { operation, calls, serviceCalls } = reader({
    service: async () => {
      await blocked
      return 'running'
    }
  })
  const first = operation()
  assert.equal(first, operation())
  finish()
  assert.equal((await first).core, 'running')
  assert.deepEqual(calls, [[true, false]])
  assert.deepEqual(serviceCalls, [[true]])
  await operation()
  assert.equal(calls.length, 2, 'a completed snapshot must not mask a later status change')
})

test('null runtime evidence and authentication transport failures never become stopped', async () => {
  const nullEvidence = reader({
    runtime: async () => ({
      core: { running: null, ready: false },
      proxy: { port: null },
      listener: { available: false }
    })
  })
  assert.equal((await nullEvidence.operation()).core, 'unknown')
  const { operation, calls } = reader({
    app: { corePermissionMode: 'service', sysProxy: { enable: false } } as AppConfig,
    runtime: async () => {
      throw { status: 401 }
    }
  })
  const result = await operation()
  assert.equal(result.core, 'unknown')
  assert.equal(result.service, 'running')
  assert.equal(result.readError, 'service-authentication-required')
  assert.deepEqual(calls, [[false, false]])
  assert.equal(buildRuntimeRecoveryGuidance(result).issue?.cause, 'service-authentication')
})

test('service process errors cannot discard independent direct core evidence', async () => {
  const { operation } = reader({
    service: async () => {
      throw new Error('unavailable')
    }
  })
  const result = await operation()
  assert.equal(result.service, 'unknown')
  assert.equal(result.core, 'running')
  assert.equal(result.serviceRequired, false)
  assert.equal(buildRuntimeRecoveryGuidance(result).issue, undefined)
})

test('an ownership change during a snapshot clears evidence from the old core', async () => {
  const app = { corePermissionMode: 'service', sysProxy: { enable: false } } as AppConfig
  const { operation } = reader({
    app,
    runtime: async () => {
      app.corePermissionMode = 'elevated'
      throw { status: 401 }
    }
  })
  const result = await operation()
  assert.equal(result.coreMode, 'direct')
  assert.equal(result.core, 'unknown')
  assert.equal(result.readError, undefined)
  assert.equal(result.proxy.available, null)
})

test('failed reads release the pending snapshot and remain retryable', async () => {
  let attempts = 0
  const { operation } = reader({
    config: async () => {
      if (++attempts === 1) throw new Error('routing configuration unavailable')
      return { enabled: false, rules: [], groups: [] }
    }
  })
  await assert.rejects(operation(), /configuration unavailable/)
  assert.equal((await operation()).core, 'running')
})

test('a stopped core with an unavailable config suggests starting it instead of editing subscriptions', () => {
  const result = buildRuntimeRecoveryGuidance(
    snapshot({ core: 'stopped', coreError: 'core-config-unavailable' })
  )
  assert.equal(result.issue?.cause, 'core-stopped')
})

test('package-managed builds never offer the Desktop service installer', () => {
  const result = buildRuntimeRecoveryGuidance(
    snapshot({ serviceRequired: true, service: 'not-installed' }),
    { serviceRepairSupported: false }
  )
  assert.deepEqual(result.issue?.actions, ['open-service-settings', 'check-again'])
})

test('no HTTP or mixed port does not make an otherwise healthy routing core unready', async () => {
  const { operation } = reader({
    runtime: async () => ({
      core: { running: true, ready: false, errorCode: 'runtime-port-unavailable' },
      proxy: { port: null },
      listener: { available: false }
    })
  })
  const result = await operation()
  assert.equal(result.core, 'running')
  assert.equal(buildRuntimeRecoveryGuidance(result).issue, undefined)
})

test('enabled routing with a stopped backend offers a retry instead of appearing healthy', () => {
  const result = routingStatus({ state: 'disabled', mihomoAvailable: false })
  assert.equal(result.issue?.cause, 'routing-unconfirmed')
  assert.equal(result.issue?.actions[0], 'check-again')
})

test('turning system proxy off suppresses an old diagnostic suggestion to restore it', () => {
  const diagnostic = diagnostics('configuration-mismatch')
  const result = buildRuntimeRecoveryGuidance(snapshot(), { diagnostics: diagnostic })
  assert.equal(result.issue, undefined)
  const enabled = snapshot({ proxy: { required: true, available: true, port: 7890 } })
  assert.equal(
    buildRuntimeRecoveryGuidance(enabled, { diagnostics: diagnostic }).issue?.actions[0],
    'restore-system-proxy'
  )
})
