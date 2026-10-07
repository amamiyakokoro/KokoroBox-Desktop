import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { createKokoroRuleSaver } from '../src/main/kokoro/rule-save'

function loadFunctions(
  path: string,
  names: string[],
  dependencies: Record<string, unknown>
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2022, true)
  const declarations = names.map((name) => {
    const node = source.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === name
    )
    assert.ok(node, `missing production function ${name}`)
    return node.getText(source)
  })
  const compiled = ts.transpileModule(declarations.join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  return new Function(
    ...Object.keys(dependencies),
    `const exports = {}; ${compiled}; return {${names.join(',')}};`
  )(...Object.values(dependencies))
}

function coreHarness(failure?: Error, backgroundFailure?: Error) {
  const calls: string[] = []
  const { restartCore } = loadFunctions('src/main/core/manager.ts', ['restartCore'], {
    beginExpectedNetworkTransition: () => {
      calls.push('begin')
      return () => calls.push('finish')
    },
    clearTailscaleAuthNotifications: () => {},
    stopCore: async () => {
      calls.push('stop')
    },
    startCore: async () => {
      calls.push('start')
      if (failure) throw failure
      return [backgroundFailure ? Promise.reject(backgroundFailure) : Promise.resolve()]
    },
    showNotification: async () => {
      calls.push('notify')
    },
    tr: (message: string) => message
  })
  return { restartCore, calls }
}

test('strict core restarts propagate startup and readiness failures and always finish the network transition', async () => {
  for (const readinessFailure of [false, true]) {
    const failure = new Error('core cannot start')
    const { restartCore, calls } = coreHarness(
      readinessFailure ? undefined : failure,
      readinessFailure ? failure : undefined
    )
    await assert.rejects(restartCore({ throwOnError: true }), (error) => error === failure)
    assert.deepEqual(calls, ['begin', 'stop', 'start', 'notify', 'finish'])
  }
  const { restartCore, calls } = coreHarness()
  await restartCore({ throwOnError: true })
  assert.deepEqual(calls, ['begin', 'stop', 'start', 'finish'])
})

test('background restarts keep their notification-only failure handling', async () => {
  const { restartCore, calls } = coreHarness(new Error('offline'))
  await restartCore()
  assert.deepEqual(calls, ['begin', 'stop', 'start', 'notify', 'finish'])
})

test('a persisted subscription with a failed core restart reports a refresh warning while preserving saved rules', async () => {
  const failure = new Error('core port already in use')
  const { restartCore } = coreHarness(failure)
  const writes: string[] = []
  const { writeProfileContent } = loadFunctions(
    'src/main/config/profile.ts',
    ['writeProfileContent'],
    {
      getProfileConfig: async () => ({ current: 'active' }),
      getProfileItem: async () => undefined,
      profilePath: (id: string) => `/profiles/${id}.yaml`,
      writeFile: async () => {
        writes.push('write')
      },
      rename: async () => {
        writes.push('rename')
      },
      rm: async () => {
        assert.fail('restart failure must not discard the saved subscription')
      },
      restartCore,
      process: { pid: 1 }
    }
  )
  const save = createKokoroRuleSaver({
    save: async () => ({ revision: 6 }) as KokoroRuleSet,
    getProfiles: async () => ({
      items: [{ id: 'active', name: 'Active', type: 'remote', kokoro: {} }] as ProfileItem[]
    }),
    refreshProfile: async (id) => {
      await writeProfileContent(id, 'rules: []', undefined, true)
    }
  })
  const result = await save(5, [])
  assert.equal(result.ruleSet.revision, 6)
  assert.deepEqual(result.subscriptionRefreshErrors, ['Active: core port already in use'])
  assert.deepEqual(writes, ['write', 'rename'])
  await writeProfileContent('inactive', 'rules: []', undefined, true)
})
