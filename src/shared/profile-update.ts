export function isValidProfileInterval(interval: unknown): interval is number {
  return (
    typeof interval === 'number' &&
    Number.isSafeInteger(interval) &&
    interval > 0 &&
    Number.isSafeInteger(interval * 60_000)
  )
}

// Subscription headers express whole hours; persisted profile intervals use minutes.
export function parseProfileUpdateInterval(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return undefined
  const minutes = Number(value.trim()) * 60
  return isValidProfileInterval(minutes) ? minutes : undefined
}

export function profileUpdateDelay(item: ProfileItem, now = Date.now()): number {
  if (!isValidProfileInterval(item.interval)) return -1
  const intervalMs = item.interval * 60 * 1000
  const updated = Number.isFinite(item.updated) && item.updated! >= 0 ? item.updated! : 0
  return Math.max(0, updated + intervalMs - now)
}

export function nextProfileUpdateAt(item: ProfileItem, now = Date.now()): number | undefined {
  if (item.type !== 'remote' || item.autoUpdate === false) return undefined
  const delay = profileUpdateDelay(item, now)
  return delay < 0 ? undefined : now + delay
}
