import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { resolveKokoroSubscriptionSettings } from '../src/shared/kokoro-subscription-settings'

function options(): KokoroSubscriptionOptions {
  return {
    formats: [],
    protocols: [
      { value: 'vmess', label: 'VMess', supports_direct: false },
      { value: 'anytls', label: 'AnyTLS', supports_direct: true }
    ],
    plans: [
      { name: 'Default', supported_isps: ['all'] },
      { name: 'Hong Kong', supported_isps: ['ct', 'cu'] }
    ],
    isps: [
      { value: '', label: 'Default' },
      { value: 'ct', label: 'CT' }
    ],
    rule_sources: ['origin', 'mirror'],
    final_routes: ['proxy', 'direct'],
    profile_update: { min_hours: 1, max_hours: 24 },
    defaults: {
      format: 'mihomo',
      protocol: 'vmess',
      plan: 'Default',
      isp: null,
      mode: 'relay',
      rule_source: 'origin',
      final_route: 'proxy',
      rule_provider_auto_update: true,
      profile_auto_update: true,
      profile_update_hours: 1
    }
  }
}

const selection: KokoroSubscriptionSettings = {
  format: 'mihomo',
  protocol: 'anytls',
  plan: 'Hong Kong',
  isp: 'ct',
  mode: 'direct',
  rule_source: 'mirror',
  final_route: 'direct',
  rule_provider_auto_update: false,
  profile_auto_update: false,
  profile_update_hours: 12
}

test('remembered subscription choices survive saving and reopening, including false switches', () => {
  const saved = JSON.parse(JSON.stringify(selection))
  assert.deepEqual(resolveKokoroSubscriptionSettings(options(), saved), selection)
  const defaults = resolveKokoroSubscriptionSettings(options())
  assert.equal(defaults.protocol, 'vmess')
  assert.equal(defaults.plan, 'Default')
  assert.equal(defaults.isp, null)
  assert.equal(defaults.profile_auto_update, true)
})

test('removed subscription choices fall back to available options and enforce protocol constraints', () => {
  const changed = options()
  changed.protocols = changed.protocols.slice(0, 1)
  changed.plans = changed.plans.slice(0, 1)
  changed.rule_sources = ['origin']
  changed.final_routes = ['proxy']
  const restored = resolveKokoroSubscriptionSettings(changed, {
    ...selection,
    profile_update_hours: 100
  })
  assert.equal(restored.protocol, 'vmess')
  assert.equal(restored.plan, 'Default')
  assert.equal(restored.isp, null)
  assert.equal(restored.mode, 'relay')
  assert.equal(restored.rule_source, 'origin')
  assert.equal(restored.final_route, 'proxy')
  assert.equal(restored.profile_update_hours, 24)
  assert.equal(
    resolveKokoroSubscriptionSettings(changed, { profile_update_hours: NaN }).profile_update_hours,
    1
  )
})

function importHandler(dependencies: Record<string, unknown>): () => Promise<void> {
  const path = 'src/renderer/src/components/profiles/kokoro-subscription-modal.tsx'
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2022, true)
  let handler: ts.Expression | undefined
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleImport')
      handler = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(handler)
  const code = ts.transpileModule('const handleImport = ' + handler.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  return new Function(...Object.keys(dependencies), code + '; return handleImport;')(
    ...Object.values(dependencies)
  )
}

test('Fetch and add persists the exact request before import can remount the page', async () => {
  const calls: string[] = []
  let saved: KokoroSubscriptionSettings | undefined
  const run = importHandler({
    settings: selection,
    canImport: true,
    supportsDirect: true,
    setImporting: (busy: boolean) => calls.push('busy:' + busy),
    patchAppConfigOrThrow: async (patch: Partial<AppConfig>) => {
      saved = structuredClone(patch.kokoroSubscriptionSettings)
      calls.push('save')
    },
    addKokoroProfile: async (request: KokoroSubscriptionSettings) => {
      assert.deepEqual(request, saved)
      assert.deepEqual(resolveKokoroSubscriptionSettings(options(), saved), selection)
      calls.push('import')
    },
    refreshProfiles: () => calls.push('refresh'),
    notify: () => {},
    tr: (message: string) => message
  })
  await run()
  assert.deepEqual(calls, ['busy:true', 'save', 'import', 'refresh', 'busy:false'])
})
