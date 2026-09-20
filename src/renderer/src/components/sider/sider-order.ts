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
export const navigationKeys = new Set<string>(['dns', 'sniff', 'rule', 'override', 'log'])

export const groupForSiderKey = (key: string): SiderGroup | undefined => {
  if (quickControlKeys.has(key)) return 'quick'
  if (accountKeys.has(key)) return 'account'
  if (currentStatusKeys.has(key)) return 'status'
  if (navigationKeys.has(key)) return 'navigation'
  return undefined
}

export const normalizeSiderOrder = (configuredOrder?: string[]): string[] => {
  const knownKeys = new Set<string>(defaultSiderOrder)
  const configured = configuredOrder ?? []
  const migratedOrder = configured.includes('rule')
    ? configured.filter((key) => key !== 'resource')
    : configured.map((key) => (key === 'resource' ? 'rule' : key))
  const uniqueConfigured = migratedOrder.filter(
    (key, index, order) => knownKeys.has(key) && order.indexOf(key) === index
  )

  return [
    ...uniqueConfigured,
    ...defaultSiderOrder.filter((key) => !uniqueConfigured.includes(key))
  ]
}

export const resolveRulesCardStatus = (
  ruleStatus?: CardStatus,
  legacyResourceStatus?: CardStatus
): CardStatus => {
  if (ruleStatus === 'hidden' && legacyResourceStatus === 'hidden') return 'hidden'
  if (ruleStatus && ruleStatus !== 'hidden') return ruleStatus
  if (legacyResourceStatus && legacyResourceStatus !== 'hidden') return legacyResourceStatus
  return 'col-span-1'
}
