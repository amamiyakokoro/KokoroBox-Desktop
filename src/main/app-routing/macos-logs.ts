import type { AppRoutingLogEntry } from '../../shared/app-routing-log'

export interface MacRoutingLog {
  time: string
  message: string
  level: string
}

// Provider reads drain its ring buffer. Retain a bounded Desktop history and
// serialize reads with clears so an in-flight batch cannot restore old entries.
export function createMacRoutingLogStore(
  read: () => Promise<MacRoutingLog[]>,
  clear: () => Promise<unknown>
): { get: () => Promise<AppRoutingLogEntry[]>; clear: () => Promise<void> } {
  let entries: AppRoutingLogEntry[] = []
  let nextId = 1
  let queue: Promise<unknown> = Promise.resolve()
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation)
    queue = result.catch(() => undefined)
    return result
  }
  return {
    get: () =>
      enqueue(async () => {
        const batch = await read()
        entries = entries
          .concat(
            batch.map((entry) => ({
              ...entry,
              id: nextId++,
              time: entry.time || new Date().toISOString()
            }))
          )
          .slice(-500)
        return entries.map((entry) => ({ ...entry }))
      }),
    clear: () =>
      enqueue(async () => {
        await clear()
        entries = []
      })
  }
}
