import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

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
