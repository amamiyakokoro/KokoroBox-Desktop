export interface SiderConnectionCounts {
  active: number
  closed: number
  activeIds: Set<string>
  closedIds: Set<string>
}

const maxClosedConnections = 200

export const emptySiderConnectionCounts = (): SiderConnectionCounts => ({
  active: 0,
  closed: 0,
  activeIds: new Set(),
  closedIds: new Set()
})

export const updateSiderConnectionCounts = (
  previous: SiderConnectionCounts,
  connections: Pick<ControllerConnectionDetail, 'id'>[]
): SiderConnectionCounts => {
  const activeIds = new Set(connections.map((connection) => connection.id))
  const closedIds = new Set([...previous.closedIds].filter((id) => !activeIds.has(id)))

  for (const id of previous.activeIds) {
    if (!activeIds.has(id)) closedIds.add(id)
  }
  while (closedIds.size > maxClosedConnections) {
    const oldestId = closedIds.values().next().value
    if (oldestId === undefined) break
    closedIds.delete(oldestId)
  }

  return { active: activeIds.size, closed: closedIds.size, activeIds, closedIds }
}
