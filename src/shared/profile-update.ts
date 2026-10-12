export function profileUpdateDelay(item: ProfileItem, now = Date.now()): number {
  if (!Number.isFinite(item.interval) || !item.interval || item.interval < 0) return -1
  const intervalMs = item.interval * 60 * 1000
  if (!Number.isFinite(intervalMs)) return -1
  const updated = Number.isFinite(item.updated) && item.updated! >= 0 ? item.updated! : 0
  return Math.max(0, updated + intervalMs - now)
}

export function nextProfileUpdateAt(item: ProfileItem, now = Date.now()): number | undefined {
  if (item.type !== 'remote' || item.autoUpdate === false) return undefined
  const delay = profileUpdateDelay(item, now)
  return delay < 0 ? undefined : now + delay
}
