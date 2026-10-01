import { isIP } from 'node:net'

/** Extract usable bootstrap IP addresses without resolving hostnames.
 * Filters system resolver stubs/fake-IP addresses to avoid resolver loops. */
export function bootstrapDNSAddresses(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const addresses: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    let host = value.trim()
    if (!isIP(host)) {
      try {
        const url = new URL(host.includes('://') ? host : `udp://${host}`)
        if (
          !['udp:', 'tcp:', 'tls:', 'https:', 'quic:', 'h3:'].includes(url.protocol) ||
          url.username ||
          url.password
        )
          continue
        host = url.hostname.replace(/^\[|\]$/g, '')
      } catch {
        continue
      }
    }
    const family = isIP(host)
    if (family === 6) {
      host = new URL(`http://[${host}]/`).hostname.slice(1, -1)
      if (host.startsWith('::ffff:') || /^fe[89ab]/.test(host)) continue
    }
    if (!family || host === '::' || host === '::1' || (host.startsWith('ff') && family === 6))
      continue
    if (family === 4) {
      const [a] = host.split('.').map(Number)
      if (
        a === 0 ||
        a === 127 ||
        a >= 224 ||
        host.startsWith('169.254.') ||
        host.startsWith('198.18.') ||
        host.startsWith('198.19.')
      )
        continue
    }
    if (!addresses.includes(host)) addresses.push(host)
  }
  return addresses
}
