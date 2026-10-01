import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { applyDnsPreset, getDnsPreset, getDnsPresetMode } from '../src/shared/dns-presets'

// Execute the production action itself with IPC/cache dependencies replaced.
// This tests ordering and failure propagation without mounting the Electron UI.
function action(
  file: string,
  select: string | ((node: ts.Node) => ts.Expression | undefined),
  dependencies: Record<string, unknown>
): (...args: unknown[]) => Promise<unknown> {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  let expression: ts.Expression | undefined
  const visit = (node: ts.Node): void => {
    if (expression) return
    expression =
      typeof select === 'string'
        ? ts.isVariableDeclaration(node) && node.name.getText(source) === select
          ? node.initializer
          : undefined
        : select(node)
    if (!expression) ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(expression, `Production action missing in ${file}`)
  const compiled = ts.transpileModule(`const action = ${expression.getText(source)}; action;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText
  return vm.runInNewContext(compiled, dependencies)
}

const hook = 'src/renderer/src/hooks/use-app-config.tsx'
const core = 'src/renderer/src/components/settings/core-runtime-config.tsx'

test('TUN firewall repair reports failures with details and never restarts the core', async () => {
  for (const failure of [undefined, 'Add(mihomo) failed: 0x80070005']) {
    const calls: string[] = []
    const repair = action(
      'src/renderer/src/components/settings/network/tun-settings.tsx',
      'resetFirewall',
      {
        loading: false,
        setLoading: (pending: boolean) => calls.push(`pending:${pending}`),
        setupFirewall: async () => {
          calls.push('repair')
          if (failure) throw failure
        },
        restartCore: () => assert.fail('Firewall rules take effect without restarting the core'),
        tr: (value: string) => value,
        notify: (title: string, options: { variant: string; body?: string }) => {
          calls.push(options.variant)
          assert.equal(title, failure ? 'Firewall repair failed' : 'Firewall reset')
          assert.equal(options.body, failure)
        }
      }
    )
    await repair()
    assert.deepEqual(calls, [
      'pending:true',
      'repair',
      failure ? 'danger' : 'success',
      'pending:false'
    ])
  }
})

test('strict config saves propagate persistence errors and refresh the cache', async () => {
  const failure = new Error('disk full')
  let refreshed = 0
  const save = action(hook, 'patchAppConfigOrThrow', {
    patch: async () => {
      throw failure
    },
    mutateAppConfig: () => {
      refreshed++
    }
  })
  await assert.rejects(save({ core: 'system' }), (error) => error === failure)
  assert.equal(refreshed, 1)
})

test('a failed settings save reports once and prevents core restart and success events', async () => {
  const calls: string[] = []
  const save = action(hook, 'patchAppConfig', {
    patchAppConfigOrThrow: async () => {
      throw new Error('disk full')
    },
    notify: () => calls.push('error')
  })
  const change = action(core, 'handleConfigChangeWithRestart', {
    patchAppConfig: save,
    restartCore: async () => calls.push('restart'),
    PubSub: { publish: () => calls.push('publish') },
    notify: () => calls.push('duplicate error')
  })
  await change('core', 'system')
  assert.deepEqual(calls, ['error'])
})

test('successful save precedes exactly one core restart and success notification', async () => {
  const calls: string[] = []
  const change = action(core, 'handleConfigChangeWithRestart', {
    patchAppConfig: async () => {
      calls.push('save')
      return {}
    },
    restartCore: async () => {
      calls.push('restart')
    },
    PubSub: { publish: () => calls.push('publish') },
    notify: () => calls.push('error')
  })
  await change('core', 'mihomo')
  assert.deepEqual(calls, ['save', 'restart', 'publish'])
})

test('DNS toggle stops before applying controlled config when persistence fails', async () => {
  const calls: string[] = []
  const change = action('src/renderer/src/components/sider/dns-card.tsx', 'onChange', {
    patchAppConfigOrThrow: async () => {
      calls.push('save')
      throw new Error('read only')
    },
    patchControledMihomoConfigOrThrow: async () => calls.push('apply'),
    restartCore: async () => calls.push('restart'),
    notify: () => calls.push('error')
  })
  await change(true)
  assert.deepEqual(calls, ['save', 'error'])
})

test('DNS toggle does not restart after controlled-config persistence fails', async () => {
  const calls: string[] = []
  const change = action('src/renderer/src/components/sider/dns-card.tsx', 'onChange', {
    patchAppConfigOrThrow: async () => calls.push('save'),
    patchControledMihomoConfigOrThrow: async () => {
      calls.push('apply')
      throw new Error('read only')
    },
    restartCore: async () => calls.push('restart'),
    notify: () => calls.push('error')
  })
  await change(true)
  assert.deepEqual(calls, ['save', 'apply', 'error'])
})

test('selecting overseas DNS stages a valid draft without saving or restarting the core', async () => {
  const values = getDnsPreset('anti-pollution')
  let staged = values
  const cleared: string[] = []
  let revision = 0
  const select = action(
    'src/renderer/src/components/settings/network/dns-settings.tsx',
    'selectDnsPreset',
    {
      values,
      applyDnsPreset,
      setValues: (next: typeof values) => {
        staged = next
      },
      setFakeIPFilterError: (error: unknown) => {
        assert.equal(error, null)
        cleared.push('fake-ip')
      },
      setDefaultNameserverError: (error: unknown) => {
        assert.equal(error, null)
        cleared.push('bootstrap')
      },
      setNameserverError: (error: unknown) => {
        assert.equal(error, null)
        cleared.push('nameserver')
      },
      setAdvancedDnsError: (error: boolean) => {
        assert.equal(error, false)
        cleared.push('advanced')
      },
      setDraftRevision: (update: (value: number) => number) => {
        revision = update(revision)
      },
      restartCore: () => assert.fail('Preset selection must wait for Save'),
      patchControledMihomoConfigOrThrow: () => assert.fail('Preset selection must wait for Save')
    }
  )
  await select('overseas')
  assert.equal(getDnsPresetMode(staged), 'overseas')
  assert.equal(getDnsPresetMode(values), 'anti-pollution')
  assert.deepEqual(cleared, ['fake-ip', 'bootstrap', 'nameserver', 'advanced'])
  assert.equal(revision, 1)
})

test('DNS Save serializes overseas resolvers and explicitly clears previous DNS policies', async () => {
  const values = { ...getDnsPreset('overseas'), useHosts: false }
  let patch: Partial<MihomoConfig> | undefined
  const save = action(
    'src/renderer/src/components/settings/network/dns-settings.tsx',
    'saveChanges',
    {
      values,
      onSave: async (next: Partial<MihomoConfig>) => {
        patch = next
        return true
      }
    }
  )
  assert.equal(await save(), true)
  assert.ok(patch?.dns)
  assert.deepEqual(patch.dns['default-nameserver'], ['1.1.1.1', '8.8.8.8'])
  assert.deepEqual(patch.dns.nameserver, values.nameserver)
  assert.deepEqual(patch.dns['proxy-server-nameserver'], values.proxyServerNameserver)
  assert.deepEqual(patch.dns['direct-nameserver'], values.directNameserver)
  assert.deepEqual(patch.dns['nameserver-policy'], { '+.arpa': ['system'] })
  assert.deepEqual(patch.dns['proxy-server-nameserver-policy'], {})
  assert.deepEqual(patch.dns['fallback-filter'], {})
  assert.deepEqual(patch.dns.fallback, [])
  assert.equal(patch.dns['respect-rules'], false)
})

test('GPU settings are saved atomically and failed saves cannot relaunch the app', async () => {
  for (const succeeds of [false, true]) {
    const saved: unknown[] = []
    let relaunched = 0
    const change = action(
      'src/renderer/src/components/settings/general-config.tsx',
      (node) => {
        if (
          ts.isJsxAttribute(node) &&
          node.name.getText() === 'onConfirm' &&
          node.initializer &&
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression?.getText().includes('pendingDisableGPU')
        ) {
          return node.initializer.expression
        }
        return undefined
      },
      {
        pendingDisableGPU: false,
        patchAppConfig: async (value: unknown) => {
          saved.push(value)
          return succeeds ? value : undefined
        },
        relaunchApp: async () => {
          relaunched++
        }
      }
    )
    await change()
    // Serialize across the VM realm for value comparison.
    assert.equal(JSON.stringify(saved), '[{"disableGPU":false,"disableAnimation":false}]')
    assert.equal(relaunched, succeeds ? 1 : 0)
  }
})
