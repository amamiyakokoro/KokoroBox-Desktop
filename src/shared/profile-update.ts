export function profileUpdateDelay(item: ProfileItem, now = Date.now()): number {
  if (!item.interval) return -1
  const intervalMs = item.interval * 60 * 1000
  return Math.max(0, (item.updated || 0) + intervalMs - now)
}

export function nextProfileUpdateAt(item: ProfileItem, now = Date.now()): number | undefined {
  if (item.type !== 'remote' || item.autoUpdate === false) return undefined
  const delay = profileUpdateDelay(item, now)
  return delay < 0 ? undefined : now + delay
}
