import { tr } from '../../shared/i18n'
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { BrowserWindow, shell } from 'electron'
import {
  KOKORO_API_BASE as API_BASE,
  KOKORO_REDIRECT_URI,
  LOGIN_TTL_MS,
  createPendingLogin,
  createCodeChallenge,
  loginURL,
  matchesLoginState,
  parseKokoroCallback,
  type PendingLogin
} from './oauth'
import {
  deleteKokoroCredentials,
  loadKokoroCredentials,
  saveKokoroCredentials,
  type KokoroCredentials
} from './auth-store'
import { createKokoroRelayProof } from '../resolve/kokoroCallbackRelay'

export { KOKORO_REDIRECT_URI } from './oauth'
const ACCESS_EXPIRY_LEEWAY_MS = 60_000
// Isolate credential-bearing requests from shared Axios interceptors. Never follow redirects.
const http = axios.create({ maxRedirects: 0 })

interface TokenResponse {
  token_type: 'Bearer'
  access_token: string
  expires_in: number
  refresh_token: string
  refresh_expires_in: number
}

interface ServerKokoroUser extends KokoroUser {
  proxy_uuid: string
}

interface ResolvedSubscription {
  format: 'mihomo'
  content_type: string
  filename: string
  profile_name: string
  authenticated_config_url: string
  external_subscription_url: string
  import_uri: null
}

export interface DownloadedKokoroProfile {
  content: string
  profileName: string
  profileUpdateInterval?: number
  subscriptionUserinfo?: string
}

export class KokoroAPIError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'KokoroAPIError'
    this.status = status
  }
}

let credentials: KokoroCredentials | null | undefined
let credentialsLoadPromise: Promise<KokoroCredentials | null> | null = null
let refreshPromise: Promise<KokoroCredentials> | null = null
let pendingLogin: PendingLogin | null = null
let pendingLoginTimer: ReturnType<typeof setTimeout> | undefined
let exchangingCode = false
let loginGeneration = 0
let sessionGeneration = 0
let credentialWrite: Promise<unknown> = Promise.resolve()

function toKokoroError(error: unknown): KokoroAPIError {
  if (error instanceof KokoroAPIError) return error
  if (axios.isAxiosError(error)) {
    return new KokoroAPIError(tr('Kokoro 请求失败'), error.response?.status)
  }
  // Do not propagate transport errors or server bodies: they may echo credentials.
  return new KokoroAPIError(tr('Kokoro 请求失败'))
}

async function getCredentials(): Promise<KokoroCredentials | null> {
  if (credentials !== undefined) return credentials
  if (!credentialsLoadPromise) {
    const generation = sessionGeneration
    credentialsLoadPromise = loadKokoroCredentials()
      .then((stored) => {
        if (generation !== sessionGeneration || credentials !== undefined)
          return credentials ?? null
        credentials = stored
        return stored
      })
      .finally(() => {
        credentialsLoadPromise = null
      })
  }
  return credentialsLoadPromise
}

function credentialsFromToken(response: TokenResponse): KokoroCredentials {
  const now = Date.now()
  return {
    accessToken: response.access_token,
    accessExpiresAt: now + response.expires_in * 1000,
    refreshToken: response.refresh_token,
    refreshExpiresAt: now + response.refresh_expires_in * 1000
  }
}

async function storeTokenResponse(
  response: TokenResponse,
  isCurrent: () => boolean = () => true
): Promise<KokoroCredentials> {
  if (typeof response?.token_type !== 'string' || response.token_type.toLowerCase() !== 'bearer') {
    throw new KokoroAPIError(tr('Kokoro 返回了不支持的 token 类型'))
  }
  if (
    !response.access_token ||
    typeof response.access_token !== 'string' ||
    !response.refresh_token ||
    typeof response.refresh_token !== 'string' ||
    !Number.isFinite(response.expires_in) ||
    response.expires_in <= 0 ||
    !Number.isFinite(response.refresh_expires_in) ||
    response.refresh_expires_in <= 0
  ) {
    throw new KokoroAPIError(tr('Kokoro 登录凭据无效'))
  }
  const next = credentialsFromToken(response)
  const write = credentialWrite
    .catch(() => {})
    .then(async () => {
      if (!isCurrent()) throw new KokoroAPIError(tr('已取消 Kokoro 登录'))
      await saveKokoroCredentials(next)
      if (!isCurrent()) {
        await deleteKokoroCredentials()
        throw new KokoroAPIError(tr('已取消 Kokoro 登录'))
      }
      credentials = next
      return next
    })
  credentialWrite = write.catch(() => {})
  return write
}

async function clearSession(): Promise<void> {
  sessionGeneration++
  credentials = null
  credentialWrite = credentialWrite.catch(() => {}).then(deleteKokoroCredentials)
  await credentialWrite
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  try {
    const response = await http.post<TokenResponse>(`${API_BASE}/app/auth/token`, body, {
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' }
    })
    return response.data
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    throw new KokoroAPIError(tr('Kokoro 授权失败，请重新登录'), status)
  }
}

async function refreshAccessToken(staleAccessToken?: string): Promise<KokoroCredentials> {
  const current = await getCredentials()
  if (!current || current.refreshExpiresAt <= Date.now()) {
    await clearSession()
    throw new KokoroAPIError(tr('Kokoro 登录已过期，请重新登录'), 401)
  }
  if (staleAccessToken && current.accessToken !== staleAccessToken) return current
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const generation = sessionGeneration
    try {
      const response = await postToken({
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken
      })
      return await storeTokenResponse(response, () => generation === sessionGeneration)
    } catch (error) {
      const apiError = toKokoroError(error)
      if (apiError.status === 401) await clearSession()
      throw apiError
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

function retryDelay(error: unknown, attempt: number): number | null {
  if (!axios.isAxiosError(error)) return null
  const status = error.response?.status
  if (status === 429) {
    const header = Number(error.response?.headers?.['retry-after'])
    return Number.isFinite(header) ? Math.min(header * 1000, 10_000) : 1000
  }
  if (!status || [500, 502, 503].includes(status)) return Math.min(500 * 2 ** attempt, 4000)
  return null
}

async function sendWithRetry<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await http.request<T>(config)
    } catch (error) {
      lastError = error
      const delay = retryDelay(error, attempt)
      if (delay == null || attempt === 2) throw error
      await new Promise((resolve) => {
        setTimeout(resolve, delay)
      })
    }
  }
  throw lastError
}

async function authorizedRequest<T>(
  config: AxiosRequestConfig,
  replayed = false,
  retryTransport = true
): Promise<AxiosResponse<T>> {
  let current = await getCredentials()
  if (!current) throw new KokoroAPIError(tr('请先登录 Kokoro'), 401)
  if (current.accessExpiresAt <= Date.now() + ACCESS_EXPIRY_LEEWAY_MS) {
    current = await refreshAccessToken(current.accessToken)
  }

  try {
    const request = {
      ...config,
      timeout: config.timeout ?? 20_000,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${current.accessToken}`
      }
    }
    return retryTransport ? await sendWithRetry<T>(request) : await http.request<T>(request)
  } catch (error) {
    if (!replayed && axios.isAxiosError(error) && error.response?.status === 401) {
      await refreshAccessToken(current.accessToken)
      return authorizedRequest<T>(config, true, retryTransport)
    }
    throw toKokoroError(error)
  }
}

export async function startKokoroLogin(): Promise<void> {
  if (pendingLogin && pendingLogin.expiresAt <= Date.now()) clearPendingLogin()
  if (pendingLogin || exchangingCode) {
    throw new KokoroAPIError(tr('Kokoro 登录正在进行中，请先取消或等待完成'))
  }
  const pending = createPendingLogin()
  pendingLogin = pending
  pendingLoginTimer = setTimeout(() => {
    if (pendingLogin !== pending) return
    clearPendingLogin()
    notifyAuthChanged()
  }, LOGIN_TTL_MS)
  pendingLoginTimer.unref()
  try {
    await shell.openExternal(loginURL(pending))
  } catch {
    if (pendingLogin === pending) clearPendingLogin()
    throw new KokoroAPIError(tr('Kokoro 授权失败，请重新登录'))
  }
}

function clearPendingLogin(): void {
  if (pendingLoginTimer) clearTimeout(pendingLoginTimer)
  pendingLoginTimer = undefined
  pendingLogin = null
}

function notifyAuthChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('kokoro-auth-changed')
  }
}

export function cancelKokoroLogin(): void {
  loginGeneration++
  clearPendingLogin()
  notifyAuthChanged()
}

export function createPendingKokoroRelayProof(nonce: string): string | null {
  const pending = pendingLogin
  if (!pending) return null
  if (pending.expiresAt <= Date.now()) {
    clearPendingLogin()
    notifyAuthChanged()
    return null
  }
  try {
    return createKokoroRelayProof(pending.state, nonce)
  } catch {
    return null
  }
}

export async function handleKokoroCallback(value: string): Promise<void> {
  let callback: URL
  try {
    callback = parseKokoroCallback(value)
  } catch {
    throw new KokoroAPIError(tr('Kokoro 登录回调地址无效'))
  }
  const pending = pendingLogin
  const state = callback.searchParams.get('state') || ''
  if (pending && pending.expiresAt <= Date.now()) {
    clearPendingLogin()
    notifyAuthChanged()
  }
  // Unsolicited or forged callbacks must not cancel a legitimate pending login.
  if (!pendingLogin || !pending || !state || !matchesLoginState(state, pending.state)) {
    throw new KokoroAPIError(tr('Kokoro 登录状态无效或已过期，请重新登录'))
  }
  // Consume before the first await: parallel deliveries and replays cannot exchange again.
  clearPendingLogin()
  const generation = loginGeneration
  const session = sessionGeneration
  exchangingCode = true
  try {
    const code = callback.searchParams.get('code')
    const error = callback.searchParams.get('error')
    if (error !== null) {
      if (code !== null || error !== 'access_denied') {
        throw new KokoroAPIError(tr('Kokoro 授权失败，请重新登录'))
      }
      throw new KokoroAPIError(tr('已取消 Kokoro 登录'))
    }
    if (!code?.trim()) throw new KokoroAPIError(tr('Kokoro 登录回调缺少授权码'))
    if (pending.redirectUri !== KOKORO_REDIRECT_URI || typeof pending.codeVerifier !== 'string') {
      throw new KokoroAPIError(tr('Kokoro 授权失败，请重新登录'))
    }
    createCodeChallenge(pending.codeVerifier) // Validate retained verifier; never downgrade.
    const response = await postToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.codeVerifier
    })
    await storeTokenResponse(
      response,
      () => generation === loginGeneration && session === sessionGeneration
    )
  } catch (error) {
    throw toKokoroError(error)
  } finally {
    exchangingCode = false
    notifyAuthChanged()
  }
}

export async function getKokoroSession(): Promise<KokoroSession> {
  if (!(await getCredentials())) return { authenticated: false }
  try {
    const [userResponse, optionsResponse] = await Promise.all([
      authorizedRequest<ServerKokoroUser>({ url: `${API_BASE}/app/me`, method: 'GET' }),
      authorizedRequest<KokoroSubscriptionOptions>({
        url: `${API_BASE}/app/subscription/options`,
        method: 'GET'
      })
    ])
    const { proxy_uuid: _proxyUuid, ...user } = userResponse.data
    return { authenticated: true, user, options: optionsResponse.data }
  } catch (error) {
    const apiError = toKokoroError(error)
    if (apiError.status === 401) return { authenticated: false }
    throw apiError
  }
}

interface KokoroCustomRulesState {
  schema_version: 1
  sets: KokoroRuleSet[]
}

const customRuleTypes = new Set<KokoroCustomRuleType>([
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'DOMAIN',
  'IP-CIDR',
  'PROCESS-NAME',
  'RULE-SET',
  'MATCH'
])

function defaultRuleSet(state: KokoroCustomRulesState): KokoroRuleSet {
  if (state?.schema_version !== 1 || !Array.isArray(state.sets)) {
    throw new KokoroAPIError(tr('Kokoro 返回了不兼容的规则集格式'))
  }
  const ruleSet = state.sets.find((item) => item?.name?.toLowerCase() === 'default')
  if (
    !ruleSet ||
    !Number.isSafeInteger(ruleSet.id) ||
    !Number.isSafeInteger(ruleSet.revision) ||
    ruleSet.revision < 1 ||
    !Array.isArray(ruleSet.rules)
  ) {
    throw new KokoroAPIError(tr('Kokoro 默认规则集不存在'))
  }
  return ruleSet
}

function validateCustomRulesOptions(options: KokoroCustomRulesOptions): void {
  if (
    options?.schema_version !== 1 ||
    !Array.isArray(options.rule_types) ||
    !Array.isArray(options.targets) ||
    !Array.isArray(options.rule_providers) ||
    !options.limits ||
    typeof options.limits !== 'object' ||
    !options.rule_types.every((type) => customRuleTypes.has(type)) ||
    !options.targets.every((target) => typeof target === 'string') ||
    !options.rule_providers.every(
      (provider) => typeof provider?.name === 'string' && typeof provider?.behavior === 'string'
    )
  ) {
    throw new KokoroAPIError(tr('Kokoro 返回了不兼容的规则集格式'))
  }
}

async function readKokoroCustomRulesState(): Promise<KokoroCustomRulesState> {
  const response = await authorizedRequest<KokoroCustomRulesState>({
    url: `${API_BASE}/app/custom-rules`,
    method: 'GET'
  })
  return response.data
}

async function readKokoroCustomRulesOptions(): Promise<KokoroCustomRulesOptions> {
  const response = await authorizedRequest<KokoroCustomRulesOptions>({
    url: `${API_BASE}/app/custom-rules/options`,
    method: 'GET'
  })
  validateCustomRulesOptions(response.data)
  return response.data
}

export async function getKokoroDefaultRules(): Promise<KokoroDefaultRules> {
  const [state, options] = await Promise.all([
    readKokoroCustomRulesState(),
    readKokoroCustomRulesOptions()
  ])
  return { ruleSet: defaultRuleSet(state), options }
}

function optionLimit(options: KokoroCustomRulesOptions, names: string[], fallback: number): number {
  for (const name of names) {
    const value = options.limits[name]
    if (Number.isSafeInteger(value) && value > 0) return value
  }
  return fallback
}

function validateCustomRuleInputs(
  rules: KokoroCustomRuleInput[],
  options: KokoroCustomRulesOptions
): void {
  if (!Array.isArray(rules)) throw new KokoroAPIError(tr('Kokoro 规则内容无效'))
  const maxRules = optionLimit(options, ['max_rules_per_set', 'rules_per_set'], 200)
  const maxPayload = optionLimit(options, ['max_payload_length', 'payload_length'], 1024)
  if (rules.length > maxRules) throw new KokoroAPIError(tr('Kokoro 规则内容无效'))

  const availableTypes = new Set(options.rule_types.filter((type) => customRuleTypes.has(type)))
  const availableTargets = new Set(options.targets)
  const domainProviders = new Set(
    options.rule_providers
      .filter((provider) => provider.behavior === 'domain')
      .map((provider) => provider.name)
  )
  let matchCount = 0
  const invalidText = /[,\p{Cc}]/u

  for (const [index, rule] of rules.entries()) {
    if (!rule || !availableTypes.has(rule.type) || !availableTargets.has(rule.target)) {
      throw new KokoroAPIError(tr('Kokoro 规则内容无效'))
    }
    if (
      !rule.target ||
      rule.target !== rule.target.trim() ||
      rule.target.length > 128 ||
      invalidText.test(rule.target)
    ) {
      throw new KokoroAPIError(tr('Kokoro 规则内容无效'))
    }
    if (rule.type === 'MATCH') {
      matchCount += 1
      if (
        matchCount > 1 ||
        index !== rules.length - 1 ||
        rule.target === 'REJECT' ||
        (rule.payload !== null && rule.payload !== '')
      ) {
        throw new KokoroAPIError(tr('Kokoro 规则内容无效'))
      }
      continue
    }
    if (
      typeof rule.payload !== 'string' ||
      !rule.payload ||
      rule.payload !== rule.payload.trim() ||
      rule.payload.length > maxPayload ||
      invalidText.test(rule.payload) ||
      (rule.type === 'RULE-SET' && !domainProviders.has(rule.payload))
    ) {
      throw new KokoroAPIError(tr('Kokoro 规则内容无效'))
    }
  }
}

function sameCustomRules(remote: KokoroCustomRule[], local: KokoroCustomRuleInput[]): boolean {
  return (
    remote.length === local.length &&
    remote.every(
      (rule, index) =>
        rule.type === local[index]?.type &&
        (rule.payload ?? null) === (local[index]?.payload ?? null) &&
        rule.target === local[index]?.target
    )
  )
}

export async function replaceKokoroDefaultRules(
  expectedRevision: number,
  rules: KokoroCustomRuleInput[]
): Promise<KokoroRuleSet> {
  const current = await getKokoroDefaultRules()
  if (current.ruleSet.revision !== expectedRevision) {
    throw new KokoroAPIError(tr('Kokoro 规则集已更新，请重新加载后再保存'), 409)
  }
  validateCustomRuleInputs(rules, current.options)

  try {
    const response = await authorizedRequest<KokoroRuleSet>(
      {
        url: `${API_BASE}/app/custom-rules/sets/${current.ruleSet.id}/rules`,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        data: { expected_revision: expectedRevision, rules }
      },
      false,
      false
    )
    if (response.data?.name?.toLowerCase() !== 'default') {
      throw new KokoroAPIError(tr('Kokoro 返回了不兼容的规则集格式'))
    }
    return response.data
  } catch (error) {
    const apiError = toKokoroError(error)
    if (apiError.status === 409 || apiError.status === 404) {
      throw new KokoroAPIError(tr('Kokoro 规则集已更新，请重新加载后再保存'), apiError.status)
    }
    if (apiError.status === 400 || apiError.status === 422) {
      throw new KokoroAPIError(tr('Kokoro 规则内容无效'), apiError.status)
    }
    if (apiError.status === 429) {
      throw new KokoroAPIError(tr('Kokoro 请求过于频繁，请稍后重试'), 429)
    }
    if (apiError.status === undefined) {
      try {
        const latest = await getKokoroDefaultRules()
        if (
          latest.ruleSet.revision > expectedRevision &&
          sameCustomRules(latest.ruleSet.rules, rules)
        ) {
          return latest.ruleSet
        }
      } catch {
        // The write result remains unknown; preserve the local edit and report the original error.
      }
    }
    throw apiError
  }
}

function validateAuthenticatedConfigUrl(value: string): string {
  const url = new URL(value)
  const base = new URL(API_BASE)
  if (
    url.protocol !== 'https:' ||
    url.origin !== base.origin ||
    url.pathname !== `${base.pathname}/app/subscription/config`
  ) {
    throw new KokoroAPIError(tr('Kokoro 返回了无效的配置下载地址'))
  }
  return url.toString()
}

export async function downloadKokoroProfile(
  settings: KokoroSubscriptionSettings
): Promise<DownloadedKokoroProfile> {
  const resolveResponse = await authorizedRequest<ResolvedSubscription>({
    url: `${API_BASE}/app/subscription/resolve`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { ...settings, format: 'mihomo' }
  })
  const resolved = resolveResponse.data
  if (resolved.format !== 'mihomo' || !resolved.content_type.toLowerCase().includes('yaml')) {
    throw new KokoroAPIError(tr('Kokoro 返回了不兼容的 Mihomo 配置格式'))
  }

  const response = await authorizedRequest<string>({
    url: validateAuthenticatedConfigUrl(resolved.authenticated_config_url),
    method: 'GET',
    responseType: 'text',
    transformResponse: [(value) => value]
  })
  const contentType = String(response.headers['content-type'] || '').toLowerCase()
  if (!contentType.includes('yaml')) {
    throw new KokoroAPIError(tr('Kokoro 配置响应不是 YAML'))
  }

  const interval = Number(response.headers['profile-update-interval'])
  return {
    content: response.data,
    profileName: resolved.profile_name,
    profileUpdateInterval: Number.isFinite(interval) && interval > 0 ? interval : undefined,
    subscriptionUserinfo: response.headers['subscription-userinfo']
      ? String(response.headers['subscription-userinfo'])
      : undefined
  }
}

export async function revokeKokoroSession(): Promise<void> {
  cancelKokoroLogin()
  sessionGeneration++
  try {
    const current = await getCredentials()
    if (current) {
      await http.post(`${API_BASE}/app/auth/revoke`, undefined, {
        timeout: 10_000,
        headers: { Authorization: `Bearer ${current.accessToken}` }
      })
    }
  } catch {
    // Explicit logout always clears local credentials, even if revoke is unavailable.
  } finally {
    await clearSession()
  }
}
