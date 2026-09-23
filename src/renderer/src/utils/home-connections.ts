export interface ActiveApplication {
  name: string
  speed: number
}

export function topActiveApplication(
  connections: ControllerConnectionDetail[] | undefined
): ActiveApplication | undefined {
  if (!connections) return undefined
  const applications = new Map<string, ActiveApplication>()
  for (const connection of connections) {
    if (connection.metadata.type === 'Inner') continue
    const path = connection.metadata.processPath?.trim()
    const name = connection.metadata.process?.trim() || path?.split(/[\\/]/).at(-1)
    const speed =
      Math.max(0, connection.downloadSpeed || 0) + Math.max(0, connection.uploadSpeed || 0)
    if (!name || speed <= 0) continue
    const key = path || name
    const existing = applications.get(key)
    applications.set(key, { name, speed: speed + (existing?.speed || 0) })
  }
  return [...applications.values()].sort(
    (a, b) => b.speed - a.speed || a.name.localeCompare(b.name)
  )[0]
}

export function activeRouteCount(connections: ControllerConnectionDetail[] | undefined): number {
  return new Set(connections?.map((connection) => connection.chains?.[0]?.trim()).filter(Boolean))
    .size
}
