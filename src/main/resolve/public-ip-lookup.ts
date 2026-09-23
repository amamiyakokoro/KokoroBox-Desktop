import { isIP } from 'node:net'
import type { AxiosRequestConfig } from 'axios'
import type { PublicIpInfo, PublicIpSnapshot } from '../../shared/home'
import { normalizeCountryCode } from '../../shared/home'

export const publicIpEndpoints = [
  'https://api.ip.sb/geoip',
  'https://ipapi.co/json/',
  'https://api64.ipify.org?format=json'
] as const

export const maximumPublicIpResponseBytes = 64 * 1024

function networkName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.trim()
  const hasControlCharacter = Array.from(name).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
  return name && name.length <= 120 && !hasControlCharacter ? name : undefined
}

function asnLabel(value: unknown): string | undefined {
  const raw = typeof value === 'number' && Number.isInteger(value) ? String(value) : value
  if (typeof raw !== 'string') return undefined
  const match = /^(?:AS)?([1-9]\d{0,9})$/i.exec(raw.trim())
  if (!match || Number(match[1]) > 4294967295) return undefined
  return `AS${Number(match[1])}`
}

export function publicIpRequestOptions(mixedPort: number, appVersion: string): AxiosRequestConfig {
  if (!Number.isInteger(mixedPort) || mixedPort < 1 || mixedPort > 65535) {
    throw new Error('A usable Mihomo mixed port is required')
  }
  return {
    proxy: { protocol: 'http', host: '127.0.0.1', port: mixedPort },
    headers: { Accept: 'application/json', 'User-Agent': `KokoroBox-Desktop/${appVersion}` },
    timeout: 5000,
    maxContentLength: maximumPublicIpResponseBytes,
    maxRedirects: 2,
    responseType: 'text',
    transformResponse: [(body) => body],
    validateStatus: () => true
  }
}

export function parsePublicIpResponse(body: string): PublicIpInfo | undefined {
  if (Buffer.byteLength(body, 'utf8') > maximumPublicIpResponseBytes) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return undefined
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const result = raw as Record<string, unknown>
  if (typeof result.ip !== 'string') return undefined
  const ip = result.ip.trim()
  if (!isIP(ip)) return undefined
  const countryCode =
    normalizeCountryCode(result.country_code) ?? normalizeCountryCode(result.country)
  const country =
    typeof result.country_name === 'string' && result.country_name.trim()
      ? result.country_name.trim()
      : typeof result.country === 'string' && !normalizeCountryCode(result.country)
        ? result.country.trim() || undefined
        : undefined
  const isp =
    networkName(result.isp) ?? networkName(result.org) ?? networkName(result.asn_organization)
  const asn = asnLabel(result.asn)
  return {
    ip,
    ...(countryCode ? { countryCode } : {}),
    ...(country ? { country } : {}),
    ...(isp ? { isp } : {}),
    ...(asn ? { asn } : {})
  }
}

export async function tryPublicIpEndpoints(
  request: (endpoint: string) => Promise<{ status: number; body: string }>
): Promise<PublicIpInfo | undefined> {
  for (const endpoint of publicIpEndpoints) {
    try {
      const response = await request(endpoint)
      if (response.status < 200 || response.status >= 300) continue
      const info = parsePublicIpResponse(response.body)
      if (info) return info
    } catch {
      // Each provider is independent. Continue with the next one.
    }
  }
  return undefined
}

export function retainPublicIpResult(
  previous: PublicIpInfo | undefined,
  next: PublicIpInfo | undefined
): PublicIpInfo | undefined {
  return next ?? previous
}

export function nextPublicIpSnapshot(
  previous: PublicIpSnapshot,
  found: PublicIpInfo | undefined
): PublicIpSnapshot {
  return { info: retainPublicIpResult(previous.info, found), stale: !found }
}
