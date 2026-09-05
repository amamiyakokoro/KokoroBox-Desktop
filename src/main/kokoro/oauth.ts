import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const KOKORO_API_BASE = 'https://amamiyakoko.ro/api'
export const KOKORO_REDIRECT_URI = 'kokoro://oauth/callback'
export const LOGIN_TTL_MS = 5 * 60_000

export interface PendingLogin {
  state: string
  codeVerifier: string
  redirectUri: typeof KOKORO_REDIRECT_URI
  expiresAt: number
}

export function createCodeChallenge(verifier: string): string {
  if (verifier.length < 43 || verifier.length > 128 || /[^A-Za-z0-9._~-]/.test(verifier)) {
    throw new Error('Invalid PKCE verifier')
  }
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

export function createPendingLogin(now = Date.now()): PendingLogin {
  return {
    state: randomBytes(32).toString('base64url'),
    codeVerifier: randomBytes(32).toString('base64url'),
    redirectUri: KOKORO_REDIRECT_URI,
    expiresAt: now + LOGIN_TTL_MS
  }
}

export function loginURL(pending: PendingLogin): string {
  const url = new URL(`${KOKORO_API_BASE}/app/auth/login`)
  url.searchParams.set('redirect_uri', pending.redirectUri)
  url.searchParams.set('state', pending.state)
  url.searchParams.set('code_challenge', createCodeChallenge(pending.codeVerifier))
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export function isKokoroURI(value: string): boolean {
  return /^kokoro:/i.test(value)
}

/** Validate the original string, before URL normalization can hide an empty # or @. */
export function parseKokoroCallback(value: string): URL {
  // Intentionally reject raw controls before URL parsing can silently remove them.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f#]/.test(value) || value.split('?')[0] !== KOKORO_REDIRECT_URI) {
    throw new Error('Invalid Kokoro callback')
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Invalid Kokoro callback')
  }
  if (
    url.protocol !== 'kokoro:' ||
    url.hostname !== 'oauth' ||
    url.pathname !== '/callback' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error('Invalid Kokoro callback')
  const seen = new Set<string>()
  for (const key of url.searchParams.keys()) {
    if (seen.has(key)) throw new Error('Duplicate callback parameter')
    seen.add(key)
  }
  return url
}

export function matchesLoginState(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}
