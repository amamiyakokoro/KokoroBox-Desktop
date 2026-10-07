import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { isDeepStrictEqual } from 'node:util'
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

function refreshHarness() {
  const initial = {
    id: 'subscription',
    name: 'Original',
    type: 'remote',
    autoUpdate: false,
    kokoro: { settings: { profile_auto_update: false } }
  } as ProfileItem
  let config: ProfileConfig = { items: [structuredClone(initial)] }
  let content: string | undefined = 'old'
  const download = deferred<{ content: string }>()
  let commitWait: Promise<void> = Promise.resolve()
  const calls: string[] = []
  const functions = loadFunctions(
    'src/main/config/profile.ts',
    [
      'withProfileMutation',
      'refreshKokoroProfile',
      'addProfileItem',
      'commitPreparedProfile',
      'updateProfileItem',
      'updateProfileItemUnlocked',
      'removeProfileItem',
      'removeProfileItemUnlocked',
      'clearKokoroProfiles',
      'clearKokoroProfilesUnlocked'
    ],
    {
      profileMutationPromise: Promise.resolve(),
      getProfileItem: async (id: string) =>
        structuredClone(config.items.find((item) => item.id === id)),
      getProfileConfig: async () => structuredClone(config),
      setProfileConfigUnlocked: async (next: ProfileConfig) => {
        config = structuredClone(next)
      },
      isDeepStrictEqual,
      prepareProfile: async (item: ProfileItem) => {
        calls.push('download')
        const downloaded = await download.promise
        return { item: { ...item, updated: 123 }, content: downloaded.content }
      },
      writeProfileContent: async (_id: string, nextContent: string) => {
        calls.push('commit')
        await commitWait
        content = nextContent
      },
      addProfileUpdater: async () => {
        calls.push('schedule')
      },
      delProfileUpdater: async () => {
        calls.push('unschedule')
      },
      existsSync: () => content !== undefined,
      profilePath: () => '/profile.yaml',
      mihomoProfileWorkDir: () => '/work',
      rm: async () => {
        content = undefined
      },
      restartCore: async () => {
        calls.push('restart')
      },
      tr: (message: string) => message
    }
  )
  return {
    refreshKokoroProfile: functions.refreshKokoroProfile,
    addProfileItem: functions.addProfileItem,
    updateProfileItem: functions.updateProfileItem,
    removeProfileItem: functions.removeProfileItem,
    clearKokoroProfiles: functions.clearKokoroProfiles,
    initial,
    download,
    calls,
    state: () => ({ config, content }),
    blockCommit: (wait: Promise<void>) => {
      commitWait = wait
    }
  }
}

async function flush() {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

test('deleting a subscription during download prevents its content and metadata from being recreated', async () => {
  const h = refreshHarness()
  const refresh = h.refreshKokoroProfile('subscription')
  await flush()
  await h.removeProfileItem('subscription')
  h.download.resolve({ content: 'new' })
  await refresh
  assert.deepEqual(h.state(), { config: { items: [] }, content: undefined })
  assert.deepEqual(h.calls, ['download', 'unschedule'])
})

test('editing a subscription during download preserves new settings and rejects the stale refresh', async () => {
  const h = refreshHarness()
  const refresh = h.refreshKokoroProfile('subscription')
  await flush()
  const edited = { ...h.initial, name: 'User edit', autoUpdate: true }
  await h.updateProfileItem(edited)
  h.download.resolve({ content: 'new' })
  await assert.rejects(refresh, /Subscription changed during refresh/)
  assert.deepEqual(h.state(), { config: { items: [edited] }, content: 'old' })
  assert.deepEqual(h.calls, ['download'])
})

test('deletion waits for an already committing refresh and removes the final file and updater', async () => {
  const h = refreshHarness()
  const commit = deferred<void>()
  h.blockCommit(commit.promise)
  const refresh = h.refreshKokoroProfile('subscription')
  h.download.resolve({ content: 'new' })
  await flush()
  assert.ok(h.calls.includes('commit'))
  const removal = h.removeProfileItem('subscription')
  await flush()
  assert.equal(h.state().config.items.length, 1)
  commit.resolve()
  await Promise.all([refresh, removal])
  assert.deepEqual(h.state(), { config: { items: [] }, content: undefined })
  assert.equal(h.calls.at(-1), 'unschedule')
})

test('clearing Kokoro subscriptions during download cannot restore them, and the mutation queue recovers after failure', async () => {
  const h = refreshHarness()
  const refresh = h.refreshKokoroProfile('subscription')
  await flush()
  await h.clearKokoroProfiles()
  h.download.resolve({ content: 'new' })
  await refresh
  assert.equal(h.state().config.items.length, 0)
  assert.equal(h.state().content, undefined)
  await assert.rejects(h.updateProfileItem(h.initial), /Profile not found/)
  await h.removeProfileItem('subscription')
})

test('an unchanged subscription refresh commits downloaded content without selecting an inactive profile', async () => {
  const h = refreshHarness()
  const refresh = h.refreshKokoroProfile('subscription')
  h.download.resolve({ content: 'new' })
  await refresh
  assert.equal(h.state().content, 'new')
  assert.equal(h.state().config.current, undefined)
  assert.equal(h.state().config.items[0].updated, 123)
  assert.deepEqual(h.calls, ['download', 'commit', 'unschedule', 'schedule'])
})

test('manual and scheduled Kokoro refreshes use the guarded path and cannot recreate a deleted profile', async () => {
  const h = refreshHarness()
  const refresh = h.addProfileItem(h.initial)
  await flush()
  await h.removeProfileItem('subscription')
  h.download.resolve({ content: 'new' })
  assert.equal(await refresh, 'subscription')
  assert.equal(h.state().config.items.length, 0)
  assert.equal(h.state().content, undefined)
  assert.deepEqual(h.calls, ['download', 'unschedule'])
})

test('preparing a Kokoro subscription validates the download before committing any content', async () => {
  let fail = false
  const calls: string[] = []
  const { prepareProfile } = loadFunctions('src/main/config/profile.ts', ['prepareProfile'], {
    downloadKokoroProfile: async () => {
      calls.push('download')
      return { content: 'rules: []', profileName: 'Remote' }
    },
    parseYaml: () => {
      calls.push('parse')
    },
    validateMihomoProfileContent: async () => {
      calls.push('validate')
      if (fail) throw new Error('invalid profile')
    },
    writeProfileContent: () => {
      assert.fail('preparation must not write')
    },
    setProfileStrUnlocked: () => {
      assert.fail('preparation must not write')
    }
  })
  const input = {
    id: 'profile',
    name: 'User name',
    type: 'remote',
    kokoro: { settings: { profile_auto_update: false } }
  }
  const prepared = (await prepareProfile(input)) as { item: ProfileItem; content: string }
  assert.equal(prepared.content, 'rules: []')
  assert.equal(prepared.item.name, 'User name')
  assert.deepEqual(calls, ['download', 'parse', 'validate'])
  fail = true
  await assert.rejects(prepareProfile(input), /invalid profile/)
})

test('age rewrites prepare encryption before committing a transaction and do not publish new keys on failure', async () => {
  const cache: ProfileConfig = {
    items: [{ id: 'p', ageRecipient: 'old' }] as ProfileItem[]
  }
  let transactions = 0
  const config = structuredClone(cache)
  const { replaceProfilePair } = loadFunctions(
    'src/main/config/profile.ts',
    ['replaceProfilePair'],
    {
      encryptAgeText: async () => {
        throw new Error('invalid recipient')
      },
      stringifyYaml: JSON.stringify,
      writeProfileKeyTransaction: async () => {
        transactions++
      },
      dataDir: () => '/fixture',
      profileConfig: cache
    }
  )
  await assert.rejects(
    replaceProfilePair(config, { id: 'p', ageRecipient: 'new' }, 'old ciphertext', 'plaintext'),
    /invalid recipient/
  )
  assert.equal(transactions, 0)
  assert.equal(config.items[0].ageRecipient, 'old')
})

test('strict stop failures preserve Service ownership and prevent a restart from launching another core', async () => {
  const calls: string[] = []
  const failure = new Error('Service refused stop')
  const { stopCore } = loadFunctions('src/main/core/manager.ts', ['stopCore'], {
    serviceCoreRuntime: {
      pauseAutoResume: () => {},
      clearStreams: () => {},
      isManaged: () => true,
      setManaged: () => calls.push('unmanaged'),
      stopEventHandlers: () => calls.push('unsubscribed')
    },
    recoverDNS: async () => {},
    getAppConfig: async () => ({ corePermissionMode: 'service' }),
    stopServiceCore: async () => {
      throw failure
    },
    appendAppLog: async () => {},
    stopLegacyDirectCore: async () => calls.push('direct-stop'),
    getAxios: async () => {}
  })
  await assert.rejects(
    stopCore(false, undefined, { throwOnError: true }),
    (error) => error === failure
  )
  assert.deepEqual(calls, [])
  const { restartCore } = loadFunctions('src/main/core/manager.ts', ['restartCore'], {
    beginExpectedNetworkTransition: () => () => {},
    clearTailscaleAuthNotifications: () => {},
    stopCore,
    startCore: () => {
      assert.fail('must not start after an unconfirmed stop')
    },
    showNotification: async () => {},
    tr: (message: string) => message
  })
  await assert.rejects(restartCore({ throwOnError: true }), (error) => error === failure)
  await stopCore()
  assert.deepEqual(calls, ['unmanaged', 'unsubscribed', 'direct-stop'])
})

test('failed profile switches restore the previous selection and restart that profile', async () => {
  let current = 'old'
  const writes: string[] = []
  let restarts = 0
  const failure = new Error('new profile invalid')
  const { changeCurrentProfileUnlocked } = loadFunctions(
    'src/main/config/profile.ts',
    ['changeCurrentProfileUnlocked'],
    {
      getProfileConfig: async () => ({ current, items: [{ id: 'new' }, { id: 'old' }] }),
      setProfileConfigUnlocked: async (config: ProfileConfig) => {
        current = config.current!
        writes.push(current)
      },
      restartCore: async (options: { throwOnError: boolean }) => {
        assert.equal(options.throwOnError, true)
        if (++restarts === 1) throw failure
      },
      appendAppLog: async () => {}
    }
  )
  await assert.rejects(changeCurrentProfileUnlocked('new'), (error) => error === failure)
  assert.equal(current, 'old')
  assert.deepEqual(writes, ['new', 'old'])
  assert.equal(restarts, 2)
  await assert.rejects(changeCurrentProfileUnlocked('missing'), /Profile not found/)
})
