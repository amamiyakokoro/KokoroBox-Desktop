export type DnsServerConnection = 'direct' | 'rules' | 'proxy'

export interface DnsServerEndpoint {
  address: string
  connection: DnsServerConnection
  proxyName?: string
  parameters: string[]
}

/**
 * Converts Mihomo's compact DNS endpoint syntax into UI-friendly fields.
 * Unknown endpoint parameters are deliberately retained so a Mihomo upgrade
 * does not make KokoroBox discard a user's configuration.
 */
export function parseDnsServerEndpoint(value: string): DnsServerEndpoint {
  const [address, suffix = ''] = value.split(/#(.+)/, 2)
  const tokens = suffix
    .split('&')
    .map((token) => token.trim())
    .filter(Boolean)

  const first = tokens[0]
  if (first?.toUpperCase() === 'RULES') {
    return { address: address.trim(), connection: 'rules', parameters: tokens.slice(1) }
  }

  // A bare first token is a proxy name (or an interface name) in Mihomo.
  if (first && !first.includes('=')) {
    return {
      address: address.trim(),
      connection: 'proxy',
      proxyName: first,
      parameters: tokens.slice(1)
    }
  }

  return { address: address.trim(), connection: 'direct', parameters: tokens }
}

export function serializeDnsServerEndpoint(endpoint: DnsServerEndpoint): string {
  const address = endpoint.address.trim()
  const tokens = [...endpoint.parameters]

  if (endpoint.connection === 'rules') {
    tokens.unshift('RULES')
  } else if (endpoint.connection === 'proxy') {
    tokens.unshift(endpoint.proxyName?.trim() || 'PROXY')
  }

  return tokens.length > 0 ? `${address}#${tokens.join('&')}` : address
}
