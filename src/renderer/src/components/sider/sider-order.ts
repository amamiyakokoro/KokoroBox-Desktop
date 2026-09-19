export type SiderGroup = 'quick' | 'account' | 'status' | 'navigation'

export const defaultSiderOrder = [
  'sysproxy',
  'tun',
  'kokoro',
  'app-routing',
  'dns',
  'sniff',
  'proxy',
  'connection',
  'profile',
  'mihomo',
  'rule',
  'resource',
  'override',
  'log'
] as const

export const quickControlKeys = new Set<string>(['sysproxy', 'tun'])
export const accountKeys = new Set<string>(['kokoro'])
export const currentStatusKeys = new Set<string>([
  'profile',
  'proxy',
  'app-routing',
  'connection',
  'mihomo'
])
export const navigationKeys = new Set<string>([
  'dns',
  'sniff',
  'rule',
  'resource',
  'override',
  'log'
])

export const groupForSiderKey = (key: string): SiderGroup | undefined => {
  if (quickControlKeys.has(key)) return 'quick'
  if (accountKeys.has(key)) return 'account'
  if (currentStatusKeys.has(key)) return 'status'
  if (navigationKeys.has(key)) return 'navigation'
  return undefined
}

export const normalizeSiderOrder = (configuredOrder?: string[]): string[] => {
  const knownKeys = new Set<string>(defaultSiderOrder)
  const uniqueConfigured = (configuredOrder ?? []).filter(
    (key, index, order) => knownKeys.has(key) && order.indexOf(key) === index
  )

  return [
    ...uniqueConfigured,
    ...defaultSiderOrder.filter((key) => !uniqueConfigured.includes(key))
  ]
}
