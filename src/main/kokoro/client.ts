import { tr } from '../../shared/i18n'
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import crypto from 'crypto'
import { shell } from 'electron'
import {
  deleteKokoroCredentials,
  loadKokoroCredentials,
  saveKokoroCredentials,
  type KokoroCredentials
} from './auth-store'

const API_BASE = 'https://amamiyakoko.ro/api'
export const KOKORO_REDIRECT_URI = 'kokoro://oauth/callback'
const ACCESS_EXPIRY_LEEWAY_MS = 60_000
const LOGIN_STATE_TTL_MS = 10 * 60_000

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
let pendingLogin: { state: string; createdAt: number } | null = null

function errorDetail(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object' || !('detail' in data)) return fallback
  const detail = (data as { detail: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        item && typeof item === 'object' && 'msg' in item ? String(item.msg) : String(item)
      )
      .join('\n')
  }
  return fallback
}

function toKokoroError(error: unknown): KokoroAPIError {
  if (error instanceof KokoroAPIError) return error
  if (axios.isAxiosError(error)) {
    return new KokoroAPIError(
      errorDetail(error.response?.data, error.message || tr('Kokoro 请求失败')),
      error.response?.status
    )
  }
  return new KokoroAPIError(error instanceof Error ? error.message : String(error))
}

async function getCredentials(): Promise<KokoroCredentials | null> {
  if (credentials !== undefined) return credentials
  if (!credentialsLoadPromise) {
    credentialsLoadPromise = loadKokoroCredentials()
      .then((stored) => {
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

async function storeTokenResponse(response: TokenResponse): Promise<KokoroCredentials> {
  if (response.token_type.toLowerCase() !== 'bearer') {
    throw new KokoroAPIError(tr('Kokoro 返回了不支持的 token 类型'))
  }
  const next = credentialsFromToken(response)
  await saveKokoroCredentials(next)
  credentials = next
  return next
}

async function clearSession(): Promise<void> {
  credentials = null
  await deleteKokoroCredentials()
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  try {
    const response = await axios.post<TokenResponse>(`${API_BASE}/app/auth/token`, body, {
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' }
    })
    return response.data
  } catch (error) {
    throw toKokoroError(error)
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
    try {
      const response = await postToken({
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken
      })
      return await storeTokenResponse(response)
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
      return await axios.request<T>(config)
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
  replayed = false
): Promise<AxiosResponse<T>> {
  let current = await getCredentials()
  if (!current) throw new KokoroAPIError(tr('请先登录 Kokoro'), 401)
  if (current.accessExpiresAt <= Date.now() + ACCESS_EXPIRY_LEEWAY_MS) {
    current = await refreshAccessToken(current.accessToken)
  }

  try {
    return await sendWithRetry<T>({
      ...config,
      timeout: config.timeout ?? 20_000,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${current.accessToken}`
      }
    })
  } catch (error) {
    if (!replayed && axios.isAxiosError(error) && error.response?.status === 401) {
      await refreshAccessToken(current.accessToken)
      return authorizedRequest<T>(config, true)
    }
    throw toKokoroError(error)
  }
}

export async function startKokoroLogin(): Promise<void> {
  const state = crypto.randomBytes(32).toString('base64url')
  pendingLogin = { state, createdAt: Date.now() }
  const loginUrl = new URL(`${API_BASE}/app/auth/login`)
  loginUrl.searchParams.set('redirect_uri', KOKORO_REDIRECT_URI)
  loginUrl.searchParams.set('state', state)
  await shell.openExternal(loginUrl.toString())
}

function stateMatches(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

export async function handleKokoroCallback(callback: URL): Promise<void> {
  const expectedCallback = new URL(KOKORO_REDIRECT_URI)
  if (
    callback.protocol !== expectedCallback.protocol ||
    callback.hostname !== expectedCallback.hostname ||
    callback.pathname !== expectedCallback.pathname
  ) {
    throw new KokoroAPIError(tr('Kokoro 登录回调地址无效'))
  }

  const pending = pendingLogin
  const state = callback.searchParams.get('state') || ''
  if (
    !pending ||
    Date.now() - pending.createdAt > LOGIN_STATE_TTL_MS ||
    !stateMatches(state, pending.state)
  ) {
    throw new KokoroAPIError(tr('Kokoro 登录状态无效或已过期，请重新登录'))
  }

  pendingLogin = null
  if (callback.searchParams.get('error') === 'access_denied') {
    throw new KokoroAPIError(tr('已取消 Kokoro 登录'))
  }
  const code = callback.searchParams.get('code') || ''
  if (!code) throw new KokoroAPIError(tr('Kokoro 登录回调缺少授权码'))

  const response = await postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: KOKORO_REDIRECT_URI
  })
  await storeTokenResponse(response)
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
  try {
    const current = await getCredentials()
    if (current) {
      await axios.post(`${API_BASE}/app/auth/revoke`, undefined, {
        timeout: 10_000,
        headers: { Authorization: `Bearer ${current.accessToken}` }
      })
    }
  } catch {
    // Explicit logout always clears local credentials, even if revoke is unavailable.
  } finally {
    pendingLogin = null
    await clearSession()
  }
}
