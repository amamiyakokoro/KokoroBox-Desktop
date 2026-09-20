export type SiderGroup = 'quick' | 'account' | 'status' | 'navigation'

const siderGroupOrder: SiderGroup[] = ['quick', 'account', 'status', 'navigation']

export const siderKeysByGroup: Record<SiderGroup, readonly string[]> = {
  quick: ['sysproxy', 'tun', 'mihomo', 'dns', 'sniff'],
  account: ['kokoro'],
  status: ['app-routing', 'proxy', 'connection', 'profile', 'rule', 'override', 'log'],
  navigation: []
}

export const defaultSiderOrder = siderGroupOrder.flatMap((group) => siderKeysByGroup[group])

export const quickControlKeys = new Set<string>(siderKeysByGroup.quick)
export const accountKeys = new Set<string>(siderKeysByGroup.account)
export const currentStatusKeys = new Set<string>(siderKeysByGroup.status)
export const navigationKeys = new Set<string>(siderKeysByGroup.navigation)

const legacyGroupForSiderKey = (key: string): SiderGroup | undefined => {
  if (['sysproxy', 'tun'].includes(key)) return 'quick'
  if (key === 'kokoro') return 'account'
  if (['profile', 'proxy', 'app-routing', 'connection', 'mihomo'].includes(key)) return 'status'
  if (['dns', 'sniff', 'rule', 'override', 'log'].includes(key)) return 'navigation'
  return undefined
}

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
  const configuredGroupRanks = uniqueConfigured.map((key) =>
    siderGroupOrder.indexOf(groupForSiderKey(key) ?? 'navigation')
  )
  const alreadyUsesCurrentGroups = configuredGroupRanks.every(
    (rank, index) => index === 0 || rank >= configuredGroupRanks[index - 1]
  )

  // Preserve all user ordering once the stored keys already follow the current group sequence.
  if (alreadyUsesCurrentGroups) {
    return siderGroupOrder.flatMap((group) => {
      const configuredGroupKeys = uniqueConfigured.filter(
        (key) => groupForSiderKey(key) === group
      )
      const missingGroupKeys = siderKeysByGroup[group].filter(
        (key) => !configuredGroupKeys.includes(key)
      )
      return [...configuredGroupKeys, ...missingGroupKeys]
    })
  }

  // For legacy interleaved orders, keep cards that stayed in their group in the user's order and
  // place cards that changed groups at their new canonical positions.
  return siderGroupOrder.flatMap((group) => {
    const configuredStableKeys = uniqueConfigured.filter(
      (key) => groupForSiderKey(key) === group && legacyGroupForSiderKey(key) === group
    )
    const missingStableKeys = siderKeysByGroup[group].filter(
      (key) => legacyGroupForSiderKey(key) === group && !configuredStableKeys.includes(key)
    )
    const movedKeys = siderKeysByGroup[group].filter(
      (key) => legacyGroupForSiderKey(key) !== group
    )

    return [...configuredStableKeys, ...missingStableKeys, ...movedKeys]
  })
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
