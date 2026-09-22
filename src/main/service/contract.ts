export const serviceContract = {
  meta: { method: 'GET', path: '/meta' },
  coreDesired: { method: 'GET', path: '/core/desired' },
  dnsLease: { method: 'POST', path: '/network/dns/lease' },
  dnsRenew: { method: 'POST', path: '/network/dns/renew' },
  dnsRelease: { method: 'DELETE', path: '/network/dns/lease' }
} as const

export interface ServiceCapabilities {
  coreDesiredState: boolean
  sysproxyLease: boolean
  sysproxyEvents: boolean
  dnsLease: boolean
  processRouter: boolean
}

export interface ServiceMeta {
  serviceVersion: string
  apiVersion: number
  capabilities: ServiceCapabilities
}

export const supportedServiceApiVersion = 1

const capabilityNames = [
  'coreDesiredState',
  'sysproxyLease',
  'sysproxyEvents',
  'dnsLease',
  'processRouter'
] as const satisfies readonly (keyof ServiceCapabilities)[]

export const legacyServiceMeta: ServiceMeta = {
  serviceVersion: 'legacy',
  apiVersion: 0,
  capabilities: {
    coreDesiredState: false,
    sysproxyLease: false,
    sysproxyEvents: false,
    dnsLease: false,
    processRouter: false
  }
}

export function validateServiceMeta(value: unknown): ServiceMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Service metadata')
  }
  const meta = value as Record<string, unknown>
  const rawCapabilities = meta.capabilities
  if (
    typeof meta.serviceVersion !== 'string' ||
    !meta.serviceVersion.trim() ||
    !Number.isInteger(meta.apiVersion) ||
    !rawCapabilities ||
    typeof rawCapabilities !== 'object' ||
    Array.isArray(rawCapabilities)
  ) {
    throw new Error('Invalid Service metadata')
  }
  if (meta.apiVersion !== supportedServiceApiVersion) {
    throw new Error(`Unsupported Service API version: ${meta.apiVersion}`)
  }

  const raw = rawCapabilities as Record<string, unknown>
  const capabilities = {} as ServiceCapabilities
  for (const name of capabilityNames) {
    const entry = raw[name]
    if (entry !== undefined && typeof entry !== 'boolean') {
      throw new Error(`Invalid Service capability: ${name}`)
    }
    capabilities[name] = entry === true
  }

  return {
    serviceVersion: meta.serviceVersion,
    apiVersion: supportedServiceApiVersion,
    capabilities
  }
}

export interface CoreDesiredStatus {
  desired_state: 'running' | 'stopped'
}

export function validateCoreDesiredStatus(value: unknown): CoreDesiredStatus {
  if (
    !value ||
    typeof value !== 'object' ||
    !['running', 'stopped'].includes((value as CoreDesiredStatus).desired_state)
  ) {
    throw new Error('Invalid Service core desired state')
  }
  return value as CoreDesiredStatus
}

export function dnsLeasePayload(servers: string[]): { servers: string[] } {
  return { servers }
}
