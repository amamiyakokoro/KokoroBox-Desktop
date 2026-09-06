import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'
import { parse as parseYaml } from 'yaml'
import * as oauth from '../src/main/kokoro/oauth.ts'
import { createDeepLinkInbox, takeInitialDeepLinks } from '../src/main/resolve/deepLinkInbox.ts'
import {
  createKokoroRelayProof,
  forwardKokoroCallback,
  kokoroCallbackRelayPath,
  startKokoroCallbackRelay
} from '../src/main/resolve/kokoroCallbackRelay.ts'
import type { KokoroCredentials } from '../src/main/kokoro/auth-store.ts'

// Exercise the real client module with isolated OS, clock, storage and HTTP boundaries.
// No browser, Keychain, live account or production endpoint is touched by these tests.
const source = ts.transpileModule(readFileSync('src/main/kokoro/client.ts', 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true
  }
}).outputText
const token = {
  token_type: 'Bearer',
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  expires_in: 3600,
  refresh_expires_in: 2592000
}
const httpError = (status: number): object => ({
  isAxiosError: true,
  message: 'secret-transport-body',
  response: { status, data: { detail: 'secret-server-body' }, headers: {} }
})
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const tick = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

function harness(stored: KokoroCredentials | null = null) {
  let now = 1_800_000_000_000
  let pending!: oauth.PendingLogin
  const timers = new Map<object, () => void>()
  const urls: string[] = []
  const posts: { url: string; body: Record<string, string>; config: unknown }[] = []
  const requests: Array<{
    url: string
    headers: Record<string, string>
    method?: string
    data?: unknown
  }> = []
  const saves: KokoroCredentials[] = []
  let deletes = 0
  let notifications = 0
  const boundaries: {
    browser: (url: string) => Promise<void>
    post: (body: Record<string, string>) => Promise<{ data: typeof token }>
    request: (config: {
      url: string
      headers: Record<string, string>
      method?: string
      data?: unknown
    }) => Promise<{ data: unknown; headers: Record<string, string> }>
    save: (next: KokoroCredentials) => Promise<void>
  } = {
    browser: async (_url: string) => {},
    post: async (_body: Record<string, string>) => ({ data: token }),
    request: async (_config: {
      url: string
      headers: Record<string, string>
      method?: string
      data?: unknown
    }) => ({
      data: { username: 'Test', proxy_uuid: 'not-for-renderer' },
      headers: {}
    }),
    save: async (_next: KokoroCredentials) => {}
  }
  const transport = {
    post: async (url: string, body: Record<string, string>, config: unknown) => {
      posts.push({ url, body, config })
      return boundaries.post(body)
    },
    request: async (config: {
      url: string
      headers: Record<string, string>
      method?: string
      data?: unknown
    }) => {
      requests.push(config)
      return boundaries.request(config)
    }
  }
  const dependencies: Record<string, unknown> = {
    '../../shared/i18n': { tr: (value: string) => value },
    axios: {
      create: (config: unknown) => {
        assert.deepEqual(config, { maxRedirects: 0 })
        return transport
      },
      isAxiosError: (error: { isAxiosError?: boolean }) => !!error?.isAxiosError
    },
    electron: {
      shell: {
        openExternal: async (url: string) => {
          urls.push(url)
          await boundaries.browser(url)
        }
      },
      BrowserWindow: {
        getAllWindows: () => [
          {
            isDestroyed: () => false,
            webContents: {
              send: (channel: string) => {
                assert.equal(channel, 'kokoro-auth-changed')
                notifications++
              }
            }
          }
        ]
      }
    },
    './oauth': {
      ...oauth,
      createPendingLogin: () => {
        pending = oauth.createPendingLogin(now)
        return pending
      }
    },
    './auth-store': {
      loadKokoroCredentials: async () => stored,
      saveKokoroCredentials: async (next: KokoroCredentials) => {
        await boundaries.save(next)
        saves.push(next)
        stored = next
      },
      deleteKokoroCredentials: async () => {
        deletes++
        stored = null
      }
    },
    '../resolve/kokoroCallbackRelay': {
      createKokoroRelayProof
    }
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', 'Date', source)(
    (name: string) => {
      assert.ok(name in dependencies, name)
      return dependencies[name]
    },
    module,
    module.exports,
    (callback: () => void) => {
      const timer = {
        unref() {
          return undefined
        }
      }
      timers.set(timer, callback)
      return timer
    },
    (timer: object) => timers.delete(timer),
    class extends Date {
      static now(): number {
        return now
      }
    }
  )
  const client = module.exports as typeof import('../src/main/kokoro/client')
  return {
    client,
    boundaries,
    urls,
    posts,
    requests,
    saves,
    timers,
    get pending() {
      return pending
    },
    get now() {
      return now
    },
    get deletes() {
      return deletes
    },
    get notifications() {
      return notifications
    },
    advance: (milliseconds: number) => {
      now += milliseconds
    },
    expire: () => {
      now += oauth.LOGIN_TTL_MS
      for (const callback of [...timers.values()]) callback()
    },
    callback: (query = 'code=test-code') =>
      `${oauth.KOKORO_REDIRECT_URI}?state=${pending.state}&${query}`
  }
}

test('RFC 7636 S256 vector hashes the ASCII verifier, with unpadded Base64URL', () => {
  assert.equal(
    oauth.createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  )
  for (const value of [
    'a'.repeat(42),
    'a'.repeat(129),
    'a'.repeat(42) + '=',
    '中'.repeat(43),
    'a'.repeat(43) + '\n'
  ]) {
    assert.throws(() => oauth.createCodeChallenge(value))
  }
  for (const length of [43, 128])
    assert.match(oauth.createCodeChallenge('~'.repeat(length)), /^[\w-]{43}$/)
})

test('each attempt creates independent CSPRNG state and verifier and a five-minute expiry', () => {
  const values = new Set<string>()
  for (let index = 0; index < 100; index++) {
    const pending = oauth.createPendingLogin(1000)
    assert.equal(pending.expiresAt, 1000 + oauth.LOGIN_TTL_MS)
    assert.equal(pending.redirectUri, 'kokoro://oauth/callback')
    for (const value of [pending.state, pending.codeVerifier]) {
      assert.match(value, /^[A-Za-z0-9_-]{43}$/)
      assert.equal(Buffer.from(value, 'base64url').length, 32)
      assert.ok(!values.has(value))
      values.add(value)
    }
  }
})

test('Windows callback relay authenticates the pending process before forwarding in memory', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-relay-test-'))
  const endpointPath = kokoroCallbackRelayPath(directory)
  const state = oauth.createPendingLogin().state
  const callback = `${oauth.KOKORO_REDIRECT_URI}?state=${state}&code=opaque-code`
  const received: string[] = []
  const relay = await startKokoroCallbackRelay(
    endpointPath,
    (nonce) => createKokoroRelayProof(state, nonce),
    (value) => received.push(value)
  )
  try {
    assert.doesNotMatch(readFileSync(endpointPath, 'utf8'), /opaque-code|state/)
    assert.equal(await forwardKokoroCallback(endpointPath, callback), true)
    assert.deepEqual(received, [callback])
    assert.equal(
      await forwardKokoroCallback(
        endpointPath,
        `${oauth.KOKORO_REDIRECT_URI}?state=unknown&code=must-not-forward`
      ),
      false
    )
    assert.deepEqual(received, [callback])
    assert.equal(await forwardKokoroCallback(endpointPath, 'kokoro://evil/callback'), false)
  } finally {
    await relay.close()
    rmSync(directory, { recursive: true, force: true })
  }
  assert.equal(await forwardKokoroCallback(endpointPath, callback), false)
})

test('callback relay proof exists only for the current unexpired pending login', async () => {
  const h = harness()
  const nonce = 'a'.repeat(43)
  assert.equal(h.client.createPendingKokoroRelayProof(nonce), null)
  await h.client.startKokoroLogin()
  assert.equal(
    h.client.createPendingKokoroRelayProof(nonce),
    createKokoroRelayProof(h.pending.state, nonce)
  )
  h.expire()
  assert.equal(h.client.createPendingKokoroRelayProof(nonce), null)
})

test('system browser login URL and code exchange body use the same verifier and redirect', async () => {
  const h = harness()
  await h.client.startKokoroLogin()
  const url = new URL(h.urls[0])
  assert.equal(url.origin + url.pathname, 'https://amamiyakoko.ro/api/app/auth/login')
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    redirect_uri: oauth.KOKORO_REDIRECT_URI,
    state: h.pending.state,
    code_challenge: oauth.createCodeChallenge(h.pending.codeVerifier),
    code_challenge_method: 'S256'
  })
  assert.ok(!h.urls[0].includes(h.pending.codeVerifier))
  await h.client.handleKokoroCallback(h.callback('code=opaque%2Bcode%26value'))
  assert.equal(h.posts.length, 1)
  assert.equal(h.posts[0].url, `${oauth.KOKORO_API_BASE}/app/auth/token`)
  assert.deepEqual(h.posts[0].body, {
    grant_type: 'authorization_code',
    code: 'opaque+code&value',
    redirect_uri: oauth.KOKORO_REDIRECT_URI,
    code_verifier: h.pending.codeVerifier
  })
  assert.deepEqual(h.posts[0].config, {
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' }
  })
  assert.deepEqual(h.saves, [
    {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessExpiresAt: h.now + 3600000,
      refreshExpiresAt: h.now + 2592000000
    }
  ])
  assert.equal(h.timers.size, 0)
  assert.ok(!Object.hasOwn((await h.client.getKokoroSession()).user ?? {}, 'proxy_uuid'))
})

test('forged URI shapes and duplicate parameters are rejected before token exchange', async () => {
  const h = harness()
  await h.client.startKokoroLogin()
  const query = `?state=${h.pending.state}&code=test-code`
  for (const address of [
    'https://oauth/callback',
    'kokoro://evil/callback',
    'kokoro://oauth/other',
    'kokoro://oauth:443/callback',
    'kokoro://oauth:/callback',
    'kokoro://user@oauth/callback',
    'kokoro://@oauth/callback',
    'kokoro://oauth/./callback',
    'kokoro://oauth/x/../callback',
    'kokoro://oauth/%63allback',
    'kokoro://oauth/callback/',
    'kokoro:///oauth/callback',
    'KOKORO://oauth/callback',
    'kokoro://OAUTH/callback',
    ' kokoro://oauth/callback'
  ])
    await assert.rejects(h.client.handleKokoroCallback(address + query))
  for (const extra of [
    '#',
    '#fragment',
    '\t',
    '\n',
    '&state=x',
    '&st%61te=x',
    '&code=again',
    '&error=x&error=y'
  ]) {
    await assert.rejects(h.client.handleKokoroCallback(h.callback() + extra))
  }
  assert.equal(h.posts.length, 0)
  // Forgery cannot evict the legitimate login.
  await h.client.handleKokoroCallback(h.callback())
  assert.equal(h.posts.length, 1)
})

test('missing, empty and unknown state are rejected without invalidating the valid state', async () => {
  const h = harness()
  await h.client.startKokoroLogin()
  for (const query of ['code=x', 'state=&code=x', 'state=unknown&code=x']) {
    await assert.rejects(h.client.handleKokoroCallback(`${oauth.KOKORO_REDIRECT_URI}?${query}`))
  }
  assert.equal(h.posts.length, 0)
  await h.client.handleKokoroCallback(h.callback())
})

test('expired state is rejected both at the boundary and after timer cleanup', async () => {
  for (const runTimer of [false, true]) {
    const h = harness()
    await h.client.startKokoroLogin()
    if (runTimer) h.expire()
    else h.advance(oauth.LOGIN_TTL_MS)
    await assert.rejects(h.client.handleKokoroCallback(h.callback()))
    assert.equal(h.posts.length, 0)
    assert.equal(h.timers.size, 0)
    await h.client.startKokoroLogin()
  }
})

test('replay is rejected during exchange and after success', async () => {
  const h = harness()
  const gate = deferred<{ data: typeof token }>()
  h.boundaries.post = () => gate.promise
  await h.client.startKokoroLogin()
  const callback = h.callback()
  const exchange = h.client.handleKokoroCallback(callback)
  await assert.rejects(h.client.handleKokoroCallback(callback))
  await assert.rejects(h.client.startKokoroLogin())
  gate.resolve({ data: token })
  await exchange
  await assert.rejects(h.client.handleKokoroCallback(callback))
  assert.equal(h.posts.length, 1)
})

test('provider denial, malformed success, explicit cancel and browser failure clean pending state', async () => {
  for (const query of [
    'error=access_denied',
    'error=unknown',
    'error=',
    'code=',
    '',
    'code=x&error=access_denied'
  ]) {
    const h = harness()
    await h.client.startKokoroLogin()
    await assert.rejects(h.client.handleKokoroCallback(h.callback(query)))
    assert.equal(h.timers.size, 0)
    assert.equal(h.posts.length, 0)
    await h.client.startKokoroLogin()
  }
  const h = harness()
  await h.client.startKokoroLogin()
  const callback = h.callback()
  h.client.cancelKokoroLogin()
  await assert.rejects(h.client.handleKokoroCallback(callback))
  assert.equal(h.timers.size, 0)
  h.boundaries.browser = async () => {
    throw new Error('secret-callback-url')
  }
  await assert.rejects(
    h.client.startKokoroLogin(),
    (error: Error) => !error.message.includes('secret')
  )
  assert.equal(h.timers.size, 0)
})

test('cold process and missing or corrupt verifier fail closed without a token request', async () => {
  const old = harness()
  await old.client.startKokoroLogin()
  const cold = harness()
  await assert.rejects(cold.client.handleKokoroCallback(old.callback()))
  assert.equal(cold.posts.length, 0)
  for (const verifier of [undefined, '', 'not-a-valid-verifier']) {
    const h = harness()
    await h.client.startKokoroLogin()
    Object.assign(h.pending, { codeVerifier: verifier })
    await assert.rejects(h.client.handleKokoroCallback(h.callback()))
    assert.equal(h.posts.length, 0)
    assert.equal(h.timers.size, 0)
  }
})

test('only one pending login exists and later logins cannot mix verifiers', async () => {
  const h = harness()
  await h.client.startKokoroLogin()
  const previous = { ...h.pending }
  const previousCallback = h.callback()
  await assert.rejects(h.client.startKokoroLogin())
  assert.equal(h.urls.length, 1)
  h.client.cancelKokoroLogin()
  await h.client.startKokoroLogin()
  assert.notEqual(h.pending.state, previous.state)
  assert.notEqual(h.pending.codeVerifier, previous.codeVerifier)
  await assert.rejects(h.client.handleKokoroCallback(previousCallback))
  await h.client.handleKokoroCallback(h.callback())
  assert.equal(h.posts[0].body.code_verifier, h.pending.codeVerifier)
})

test('400/422 failures never retry, omit verifier or downgrade; errors do not reflect credentials', async () => {
  for (const status of [400, 422]) {
    const h = harness()
    h.boundaries.post = async () => {
      throw httpError(status)
    }
    await h.client.startKokoroLogin()
    const callback = h.callback()
    await assert.rejects(
      h.client.handleKokoroCallback(callback),
      (error: Error & { status?: number }) => {
        assert.equal(error.status, status)
        assert.ok(!JSON.stringify(error).includes('secret'))
        assert.ok(!error.message.includes('test-code'))
        return true
      }
    )
    await assert.rejects(h.client.handleKokoroCallback(callback))
    assert.equal(h.posts.length, 1)
    assert.ok(h.posts[0].body.code_verifier)
    assert.equal(h.saves.length, 0)
    assert.equal(h.timers.size, 0)
  }
})

test('cancellation and logout during exchange cannot restore a session', async () => {
  for (const logout of [false, true]) {
    const h = harness()
    const gate = deferred<{ data: typeof token }>()
    h.boundaries.post = () => gate.promise
    await h.client.startKokoroLogin()
    const exchange = h.client.handleKokoroCallback(h.callback())
    const rejected = assert.rejects(exchange)
    if (logout) await h.client.revokeKokoroSession()
    else h.client.cancelKokoroLogin()
    gate.resolve({ data: token })
    await rejected
    assert.equal(h.saves.length, 0)
    assert.deepEqual(await h.client.getKokoroSession(), { authenticated: false })
  }
})

test('cancellation while secure storage is writing removes the newly saved credentials', async () => {
  const h = harness()
  const gate = deferred<void>()
  h.boundaries.save = () => gate.promise
  await h.client.startKokoroLogin()
  const exchange = h.client.handleKokoroCallback(h.callback())
  const rejected = assert.rejects(exchange)
  await tick()
  h.client.cancelKokoroLogin()
  gate.resolve()
  await rejected
  assert.equal(h.deletes, 1)
  assert.deepEqual(await h.client.getKokoroSession(), { authenticated: false })
})

function staleCredentials(): KokoroCredentials {
  return {
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    accessExpiresAt: 0,
    refreshExpiresAt: 1_900_000_000_000
  }
}

test('refresh is single-flight and waiting APIs are released only after atomic token storage', async () => {
  const h = harness(staleCredentials())
  const gate = deferred<void>()
  h.boundaries.save = () => gate.promise
  const sessions = [h.client.getKokoroSession(), h.client.getKokoroSession()]
  await tick()
  assert.equal(h.posts.length, 1)
  assert.deepEqual(h.posts[0].body, { grant_type: 'refresh_token', refresh_token: 'old-refresh' })
  assert.equal(h.requests.length, 0)
  gate.resolve()
  assert.ok((await Promise.all(sessions)).every((session) => session.authenticated))
  assert.equal(h.saves.length, 1)
  assert.equal(h.requests.length, 4)
  assert.ok(
    h.requests.every((request) => request.headers.Authorization === `Bearer ${token.access_token}`)
  )
})

test('access 401 refreshes once and replays each protected API only once', async () => {
  const h = harness({ ...staleCredentials(), accessExpiresAt: 1_900_000_000_000 })
  h.boundaries.request = async () => {
    throw httpError(401)
  }
  assert.deepEqual(await h.client.getKokoroSession(), { authenticated: false })
  await tick()
  assert.equal(h.posts.length, 1)
  assert.equal(h.requests.length, 4)
})

test('refresh 401 clears credentials and does not send a verifier or retry', async () => {
  const h = harness(staleCredentials())
  h.boundaries.post = async () => {
    throw httpError(401)
  }
  assert.deepEqual(await h.client.getKokoroSession(), { authenticated: false })
  assert.equal(h.posts.length, 1)
  assert.equal(h.deletes, 1)
  assert.equal(h.requests.length, 0)
  assert.equal(h.posts[0].body.code_verifier, undefined)
})

test('failed secure storage never exposes an authenticated session or releases waiting APIs', async () => {
  const h = harness(staleCredentials())
  h.boundaries.save = async () => {
    throw new Error('secret-storage-value')
  }
  await assert.rejects(
    h.client.getKokoroSession(),
    (error: Error) => !error.message.includes('secret')
  )
  assert.equal(h.requests.length, 0)
  assert.equal(h.saves.length, 0)
})

const customRulesOptions = {
  schema_version: 1 as const,
  rule_types: ['DOMAIN-SUFFIX', 'RULE-SET', 'MATCH'],
  targets: ['DIRECT', 'REJECT', 'Tokyo'],
  rule_providers: [
    { name: 'geosite-private', behavior: 'domain' },
    { name: 'geoip-private', behavior: 'ipcidr' }
  ],
  limits: { max_rules_per_set: 200, max_payload_length: 1024 }
}

const defaultRuleSet = {
  id: 12,
  name: 'default',
  revision: 4,
  created_at: '2026-09-05T10:00:00Z',
  updated_at: '2026-09-05T11:30:00Z',
  rules: [
    {
      id: 51,
      type: 'DOMAIN-SUFFIX',
      payload: 'example.com',
      target: 'DIRECT',
      priority: 0,
      updated_at: '2026-09-05T11:30:00Z'
    }
  ]
}

function authenticatedCredentials(): KokoroCredentials {
  return {
    accessToken: 'rules-access',
    refreshToken: 'rules-refresh',
    accessExpiresAt: 1_900_000_000_000,
    refreshExpiresAt: 1_900_000_000_000
  }
}

test('custom-rules read exposes only default with current dynamic options', async () => {
  const h = harness(authenticatedCredentials())
  h.boundaries.request = async (config) => {
    if (config.url.endsWith('/app/custom-rules/options'))
      return { data: customRulesOptions, headers: {} }
    if (config.url.endsWith('/app/custom-rules')) {
      return {
        data: {
          schema_version: 1,
          sets: [defaultRuleSet, { ...defaultRuleSet, id: 99, name: 'private', rules: [] }]
        },
        headers: {}
      }
    }
    throw new Error('unexpected request')
  }

  const result = await h.client.getKokoroDefaultRules()
  assert.deepEqual(result, { ruleSet: defaultRuleSet, options: customRulesOptions })
  assert.equal(h.requests.length, 2)
  assert.ok(h.requests.every((request) => request.method === 'GET'))
  assert.ok(h.requests.every((request) => request.headers.Authorization === 'Bearer rules-access'))
  assert.ok(h.requests.every((request) => !JSON.stringify(request).includes('private')))
})

test('custom-rules save replaces only default with its expected revision and current options', async () => {
  const h = harness(authenticatedCredentials())
  const rules = [
    { type: 'RULE-SET' as const, payload: 'geosite-private', target: 'REJECT' },
    { type: 'MATCH' as const, payload: null, target: 'DIRECT' }
  ]
  const updated = {
    ...defaultRuleSet,
    revision: 5,
    rules: rules.map((rule, index) => ({
      ...rule,
      id: 60 + index,
      priority: index,
      updated_at: '2026-09-05T12:00:00Z'
    }))
  }
  h.boundaries.request = async (config) => {
    if (config.url.endsWith('/app/custom-rules/options'))
      return { data: customRulesOptions, headers: {} }
    if (config.url.endsWith('/app/custom-rules')) {
      return { data: { schema_version: 1, sets: [defaultRuleSet] }, headers: {} }
    }
    if (config.url.endsWith('/app/custom-rules/sets/12/rules')) {
      return { data: updated, headers: {} }
    }
    throw new Error('unexpected request')
  }

  assert.deepEqual(await h.client.replaceKokoroDefaultRules(4, rules), updated)
  const writes = h.requests.filter((request) => request.method === 'PUT')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].url, `${oauth.KOKORO_API_BASE}/app/custom-rules/sets/12/rules`)
  assert.deepEqual(writes[0].data, { expected_revision: 4, rules })
  assert.equal(writes[0].headers.Authorization, 'Bearer rules-access')
})

test('custom-rules save preserves local edits on a stale revision without writing', async () => {
  const h = harness(authenticatedCredentials())
  h.boundaries.request = async (config) => {
    if (config.url.endsWith('/app/custom-rules/options'))
      return { data: customRulesOptions, headers: {} }
    if (config.url.endsWith('/app/custom-rules')) {
      return {
        data: { schema_version: 1, sets: [{ ...defaultRuleSet, revision: 5 }] },
        headers: {}
      }
    }
    throw new Error('unexpected write')
  }

  await assert.rejects(
    h.client.replaceKokoroDefaultRules(4, [
      { type: 'DOMAIN-SUFFIX', payload: 'local.example', target: 'DIRECT' }
    ]),
    /重新加载/
  )
  assert.equal(h.requests.filter((request) => request.method === 'PUT').length, 0)
})

test('custom-rules uncertain write is not retried and reconciles an applied result', async () => {
  const h = harness(authenticatedCredentials())
  const rules = [{ type: 'DOMAIN-SUFFIX' as const, payload: 'saved.example', target: 'DIRECT' }]
  let stateReads = 0
  h.boundaries.request = async (config) => {
    if (config.url.endsWith('/app/custom-rules/options'))
      return { data: customRulesOptions, headers: {} }
    if (config.url.endsWith('/app/custom-rules')) {
      stateReads += 1
      return {
        data: {
          schema_version: 1,
          sets: [
            stateReads === 1
              ? defaultRuleSet
              : {
                  ...defaultRuleSet,
                  revision: 5,
                  rules: [
                    {
                      ...rules[0],
                      id: 75,
                      priority: 0,
                      updated_at: '2026-09-05T12:00:00Z'
                    }
                  ]
                }
          ]
        },
        headers: {}
      }
    }
    if (config.url.endsWith('/app/custom-rules/sets/12/rules')) {
      throw { isAxiosError: true, message: 'timeout-with-secret' }
    }
    throw new Error('unexpected request')
  }

  const result = await h.client.replaceKokoroDefaultRules(4, rules)
  assert.equal(result.revision, 5)
  assert.equal(stateReads, 2)
  assert.equal(h.requests.filter((request) => request.method === 'PUT').length, 1)
})

test('desktop inbox handles pre-ready and warm deliveries and strips OAuth argv before relaunch', async () => {
  const cold = harness()
  const results: string[] = []
  let failures = 0
  const inbox = createDeepLinkInbox(
    async (url) => {
      results.push(url)
      await cold.client.handleKokoroCallback(url)
    },
    () => {
      failures++
    }
  )
  const callback = `${oauth.KOKORO_REDIRECT_URI}?state=lost&code=lost`
  const argv = ['KokoroBox', '--flag', callback, '--last-flag']
  for (const value of takeInitialDeepLinks(argv)) inbox.receive(value)
  assert.deepEqual(argv, ['KokoroBox', '--flag', '--last-flag'])
  assert.equal(results.length, 0)
  inbox.start()
  await tick()
  assert.equal(failures, 1)
  assert.equal(cold.posts.length, 0)
  await cold.client.startKokoroLogin()
  inbox.receive(cold.callback())
  await tick()
  assert.equal(cold.posts.length, 1)
  inbox.receive('https://example.invalid')
  assert.equal(results.length, 2)
})

test('packaging registers the shared scheme and Windows callback relay precedes app locking', () => {
  const config = parseYaml(readFileSync('electron-builder.yml', 'utf8'))
  const protocols = Array.isArray(config.protocols) ? config.protocols : [config.protocols]
  assert.ok(protocols.some((item: { schemes: string[] }) => item.schemes.includes('kokoro')))
  assert.match(JSON.stringify(config.linux.desktop), /x-scheme-handler\/kokoro/)
  const init = readFileSync('src/main/utils/init.ts', 'utf8')
  assert.match(init, /['"]kokoro['"]/) // Runtime Windows/dev registration.
  const main = readFileSync('src/main/index.ts', 'utf8')
  const callbackRelay = main.indexOf('void forwardKokoroCallback(')
  const singleInstanceLock = main.indexOf('app.requestSingleInstanceLock()')
  assert.ok(callbackRelay >= 0 && callbackRelay < singleInstanceLock)
  assert.ok(singleInstanceLock < main.indexOf('ensureWindowsElevatedStartup(syncConfig'))
  assert.ok(
    singleInstanceLock < main.indexOf('takeInitialDeepLinks(process.argv)') &&
      main.indexOf('takeInitialDeepLinks(process.argv)') <
        main.indexOf('ensureWindowsElevatedStartup(syncConfig')
  )
  assert.match(main, /event\.preventDefault\(\)/)
})

test('Windows packaging uses KokoroBox names and migrates legacy Sparkle tasks', () => {
  const metadata = JSON.parse(readFileSync('package.json', 'utf8'))
  const config = parseYaml(readFileSync('electron-builder.yml', 'utf8'))
  assert.equal(metadata.author.name, 'KokoroBox contributors')
  assert.equal(metadata.author.email, '10204811+PhoenixEmik@users.noreply.github.com')
  assert.equal(
    config.linux.maintainer,
    'KokoroBox contributors <10204811+PhoenixEmik@users.noreply.github.com>'
  )
  assert.equal(config.productName, 'KokoroBox')
  assert.equal(config.win.executableName, 'KokoroBox')
  assert.equal(config.nsis.shortcutName, 'KokoroBox')

  const prepare = readFileSync('scripts/prepare.ts', 'utf8')
  assert.match(prepare, /file[sS]?,?\s*['"]kokorobox-run\.exe|kokorobox-run\.exe/)
  assert.match(prepare, /go['"],\s*\[?['"]build|execFileSync\(\s*['"]go['"]/)
  assert.doesNotMatch(prepare, /sparkle-run\/releases\/download\/\$\{arch\}\/sparkle-run\.exe/)

  const runner = readFileSync('build/windows/runner/main.go', 'utf8')
  assert.match(runner, /KokoroBox Runner/)
  assert.doesNotMatch(runner, /Sparkle Runner/)
  assert.match(runner, /clash:\/\//)
  assert.doesNotMatch(runner, /kokoro:\/\//)

  const misc = readFileSync('src/main/sys/misc.ts', 'utf8')
  assert.match(misc, /WINDOWS_ELEVATE_TASK_NAME = 'KokoroBox Elevated'/)
  assert.match(misc, /resourcesFilesDir\(\), WINDOWS_RUNNER_FILENAME/)
  assert.match(misc, /function elevateTaskXml\(\)/)
  assert.doesNotMatch(misc, /copyFileSync/)

  const autoRun = readFileSync('src/main/sys/autoRun.ts', 'utf8')
  assert.match(autoRun, /WINDOWS_AUTO_RUN_TASK_NAME = 'KokoroBox'/)
  assert.match(autoRun, /function taskXml\(\)/)
  assert.match(autoRun, /migrateLegacyWindowsTasks/)
  assert.match(autoRun, /LEGACY_WINDOWS_AUTO_RUN_TASK_NAME/)
  assert.doesNotMatch(autoRun, /<Command>.*sparkle-run\.exe/)

  const startup = readFileSync('src/main/sys/startup.ts', 'utf8')
  assert.doesNotMatch(startup, /\/run['"], ['"]\/tn['"], ['"]sparkle-run/)

  const workflow = readFileSync('.github/workflows/build.yml', 'utf8')
  assert.match(workflow, /Setup Go for KokoroBox Runner/)
})

test('secure storage writes one encrypted record and never deletes the old record before rename', async () => {
  const storeSource = ts.transpileModule(readFileSync('src/main/kokoro/auth-store.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  for (const platform of ['darwin', 'win32', 'linux']) {
    const path = '/mock-private/kokoro-auth.json'
    const operations: string[] = []
    let available = true
    let backend = 'gnome_libsecret'
    let failRename = false
    let decrypted = JSON.stringify(staleCredentials())
    let encryptedInput = ''
    let envelope = JSON.stringify({
      version: 1,
      storage: 'electron-safe-storage',
      encrypted: 'ZW5jcnlwdGVk'
    })
    const dependencies: Record<string, unknown> = {
      '../../shared/i18n': { tr: (value: string) => value },
      'fs/promises': {
        mkdir: async () => {},
        readFile: async () => envelope,
        writeFile: async (target: string, data: string, options: unknown) => {
          assert.equal(target, `${path}.tmp`)
          assert.deepEqual(options, { encoding: 'utf-8', mode: 0o600 })
          assert.ok(!data.includes('old-access') && !data.includes('old-refresh'))
          operations.push('write')
        },
        rename: async (from: string, to: string) => {
          assert.equal(from, `${path}.tmp`)
          assert.equal(to, path)
          operations.push('rename')
          if (failRename) throw new Error('rename failed')
        },
        unlink: async (target: string) => {
          operations.push(`unlink:${target}`)
        }
      },
      path: { dirname: () => '/mock-private' },
      electron: {
        safeStorage: {
          isEncryptionAvailable: () => available,
          getSelectedStorageBackend: () => backend,
          encryptString: (value: string) => {
            encryptedInput = value
            return Buffer.from('encrypted')
          },
          decryptString: () => decrypted
        }
      },
      '../utils/dirs': { kokoroAuthStorePath: () => path }
    }
    const module = { exports: {} }
    new Function('require', 'module', 'exports', 'process', storeSource)(
      (name: string) => {
        assert.ok(name in dependencies, name)
        return dependencies[name]
      },
      module,
      module.exports,
      { platform }
    )
    const store = module.exports as typeof import('../src/main/kokoro/auth-store')
    await store.saveKokoroCredentials(staleCredentials())
    assert.deepEqual(JSON.parse(encryptedInput), staleCredentials())
    assert.deepEqual(operations, ['write', 'rename'])
    assert.deepEqual(await store.loadKokoroCredentials(), staleCredentials())
    operations.length = 0
    failRename = true
    await assert.rejects(store.saveKokoroCredentials(staleCredentials()))
    assert.deepEqual(operations, ['write', 'rename', `unlink:${path}.tmp`])
    decrypted = '{secret-decrypted-credential'
    await assert.rejects(
      store.loadKokoroCredentials(),
      (error: Error) => !error.message.includes('secret')
    )
    envelope = '{secret-invalid-envelope'
    await assert.rejects(
      store.loadKokoroCredentials(),
      (error: Error) => !error.message.includes('secret')
    )
    available = false
    operations.length = 0
    await assert.rejects(store.saveKokoroCredentials(staleCredentials()))
    assert.equal(operations.length, 0)
    if (platform === 'linux') {
      available = true
      backend = 'basic_text'
      await assert.rejects(store.saveKokoroCredentials(staleCredentials()))
      assert.equal(operations.length, 0)
    }
  }
})
