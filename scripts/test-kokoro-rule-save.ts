import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createKokoroRuleSaver } from '../src/main/kokoro/rule-save'

const saved = { id: 1, name: 'default', revision: 5, rules: [] } as unknown as KokoroRuleSet
function profile(id: string, kokoro = true, type: 'remote' | 'local' = 'remote'): ProfileItem {
  return { id, name: id, type, kokoro: kokoro ? { settings: {} } : undefined } as ProfileItem
}

test('a successful save refreshes all Kokoro subscriptions, current first, including manual-update profiles', async () => {
  const calls: string[] = []
  const save = createKokoroRuleSaver({
    save: async () => {
      calls.push('save')
      return saved
    },
    getProfiles: async () => ({
      current: 'current',
      items: [
        profile('other'),
        { ...profile('current'), autoUpdate: false },
        profile('external', false),
        profile('local', true, 'local')
      ]
    }),
    refreshProfile: async (id) => {
      calls.push(id)
    }
  })
  assert.deepEqual(await save(4, []), { ruleSet: saved, subscriptionRefreshErrors: [] })
  assert.deepEqual(calls, ['save', 'current', 'other'])
})

test('failed rule writes do not download subscriptions, and the next save can proceed', async () => {
  let fail = true
  let downloaded = 0
  const save = createKokoroRuleSaver({
    save: async () => {
      if (fail) throw new Error('revision conflict')
      return saved
    },
    getProfiles: async () => ({ items: [profile('current')] }),
    refreshProfile: async () => {
      downloaded++
    }
  })
  await assert.rejects(save(4, []), /revision conflict/)
  assert.equal(downloaded, 0)
  fail = false
  await save(4, [])
  assert.equal(downloaded, 1)
})

test('partial refresh failures preserve the saved revision and still refresh other subscriptions', async () => {
  const refreshed: string[] = []
  let writes = 0
  const save = createKokoroRuleSaver({
    save: async () => {
      writes++
      return saved
    },
    getProfiles: async () => ({ items: [profile('offline'), profile('online')] }),
    refreshProfile: async (id) => {
      refreshed.push(id)
      if (id === 'offline') throw new Error('network unavailable')
    }
  })
  const result = await save(4, [])
  assert.equal(result.ruleSet.revision, 5)
  assert.deepEqual(result.subscriptionRefreshErrors, ['offline: network unavailable'])
  assert.deepEqual(refreshed, ['offline', 'online'])
  assert.equal(writes, 1)
})

test('profile-list errors remain a refresh warning, and missing subscriptions are a successful save', async () => {
  const save = createKokoroRuleSaver({
    save: async () => saved,
    getProfiles: async () => {
      throw new Error('profile read failed')
    },
    refreshProfile: async () => {
      assert.fail('must not refresh')
    }
  })
  assert.deepEqual(await save(4, []), {
    ruleSet: saved,
    subscriptionRefreshErrors: ['profile read failed']
  })
  const empty = createKokoroRuleSaver({
    save: async () => saved,
    getProfiles: async () => ({ items: [] }),
    refreshProfile: async () => {
      assert.fail('must not create a subscription')
    }
  })
  assert.deepEqual(await empty(4, []), { ruleSet: saved, subscriptionRefreshErrors: [] })
})

test('concurrent entry points wait until the previous saved revision finishes refreshing', async () => {
  const calls: string[] = []
  let finish!: () => void
  const blocked = new Promise<void>((resolve) => {
    finish = resolve
  })
  const save = createKokoroRuleSaver({
    save: async (revision) => {
      calls.push(`save-${revision}`)
      return { ...saved, revision: revision + 1 }
    },
    getProfiles: async () => ({ items: [profile('current')] }),
    refreshProfile: async () => {
      calls.push('refresh')
      await blocked
    }
  })
  const first = save(4, [])
  const second = save(5, [])
  await new Promise((resolve) => {
    setImmediate(resolve)
  })
  assert.deepEqual(calls, ['save-4', 'refresh'])
  finish()
  assert.equal((await first).ruleSet.revision, 5)
  assert.equal((await second).ruleSet.revision, 6)
  assert.deepEqual(calls, ['save-4', 'refresh', 'save-5', 'refresh'])
})
