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
  if (!value || typeof value !== 'object') throw new Error('Invalid Service metadata')
  const meta = value as Partial<ServiceMeta>
  const capabilities = meta.capabilities
  if (
    typeof meta.serviceVersion !== 'string' ||
    !Number.isInteger(meta.apiVersion) ||
    (meta.apiVersion ?? 0) < 1 ||
    !capabilities ||
    typeof capabilities.coreDesiredState !== 'boolean' ||
    typeof capabilities.sysproxyLease !== 'boolean' ||
    typeof capabilities.sysproxyEvents !== 'boolean' ||
    typeof capabilities.dnsLease !== 'boolean' ||
    typeof capabilities.processRouter !== 'boolean'
  ) {
    throw new Error('Invalid Service metadata')
  }
  return meta as ServiceMeta
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
