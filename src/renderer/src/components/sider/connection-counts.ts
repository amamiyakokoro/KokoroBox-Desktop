export interface SiderConnectionCounts {
  active: number
  closed: number
  activeIds: Set<string>
}

export const emptySiderConnectionCounts = (): SiderConnectionCounts => ({
  active: 0,
  closed: 0,
  activeIds: new Set()
})

export const updateSiderConnectionCounts = (
  previous: SiderConnectionCounts,
  connections: Pick<ControllerConnectionDetail, 'id'>[]
): SiderConnectionCounts => {
  const activeIds = new Set(connections.map((connection) => connection.id))
  let closed = 0
  for (const id of previous.activeIds) {
    if (!activeIds.has(id)) closed += 1
  }

  return { active: activeIds.size, closed, activeIds }
}
