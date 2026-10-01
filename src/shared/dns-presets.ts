export type DnsPresetMode = 'anti-pollution' | 'overseas'

export const defaultDnsFakeIpFilter = [
  '+.lan',
  '+.local',
  'time.*.com',
  'ntp.*.com',
  '+.market.xiaomi.com'
]

export interface DnsPresetValues {
  enhancedMode: DnsMode
  fakeIPFilterMode: FilterMode
  fakeIPFilter: string[]
  respectRules: boolean
  defaultNameserver: string[]
  nameserver: string[]
  proxyServerNameserver: string[]
  directNameserver: string[]
  directNameserverFollowPolicy: boolean
  nameserverPolicy: Record<string, string | string[]>
  proxyServerNameserverPolicy: Record<string, string | string[]>
  fallback: string[]
  fallbackFilter: Record<string, boolean | string | string[]>
  fallbackLazyQuery: boolean
}

// Provider hostnames keep TLS certificate verification and SNI enabled.
const overseasNameservers = [
  'https://cloudflare-dns.com/dns-query',
  'https://dns.google/dns-query',
  'tls://one.one.one.one',
  'tls://dns.google'
]

const dnsPresets: Record<DnsPresetMode, DnsPresetValues> = {
  'anti-pollution': {
    enhancedMode: 'fake-ip',
    fakeIPFilterMode: 'blacklist',
    fakeIPFilter: defaultDnsFakeIpFilter,
    respectRules: true,
    defaultNameserver: ['tls://223.5.5.5', 'tls://119.29.29.29'],
    // A DNS endpoint suffix selects a concrete proxy group, not a built-in outbound.
    nameserver: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
    proxyServerNameserver: ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
    directNameserver: ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
    directNameserverFollowPolicy: true,
    nameserverPolicy: {
      '+.arpa': ['system'],
      'geosite:cn': ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
      'geosite:geolocation-!cn': ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query']
    },
    proxyServerNameserverPolicy: {},
    fallback: [],
    fallbackFilter: {},
    fallbackLazyQuery: false
  },
  overseas: {
    enhancedMode: 'fake-ip',
    fakeIPFilterMode: 'blacklist',
    fakeIPFilter: defaultDnsFakeIpFilter,
    respectRules: false,
    defaultNameserver: ['1.1.1.1', '8.8.8.8'],
    nameserver: [...overseasNameservers],
    proxyServerNameserver: [...overseasNameservers],
    directNameserver: [...overseasNameservers],
    directNameserverFollowPolicy: false,
    nameserverPolicy: { '+.arpa': ['system'] },
    proxyServerNameserverPolicy: {},
    fallback: [],
    fallbackFilter: {},
    fallbackLazyQuery: false
  }
}

export function getDnsPreset(mode: DnsPresetMode): DnsPresetValues {
  return structuredClone(dnsPresets[mode])
}

export function applyDnsPreset<T extends DnsPresetValues>(values: T, mode: DnsPresetMode): T {
  return { ...values, ...getDnsPreset(mode) }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)])
    )
  }
  return value
}

export function getDnsPresetMode(values: DnsPresetValues): DnsPresetMode | 'custom' {
  for (const mode of ['anti-pollution', 'overseas'] as const) {
    const preset = dnsPresets[mode]
    if (
      (Object.keys(preset) as (keyof DnsPresetValues)[]).every(
        (key) => JSON.stringify(canonical(values[key])) === JSON.stringify(canonical(preset[key]))
      )
    ) {
      return mode
    }
  }
  return 'custom'
}
