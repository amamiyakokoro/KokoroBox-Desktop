import { profileUpdateDelay } from '../../shared/profile-update'

interface Dependencies {
  getItem: (id: string) => Promise<ProfileItem | undefined>
  refresh: (item: ProfileItem) => Promise<unknown>
  onError: (id: string, error: unknown) => void
  now?: () => number
  setTimer?: (callback: () => void, delay: number) => () => void
}
interface Entry {
  id: string
  failures: number
  cancel?: () => void
}
function eligible(item: ProfileItem | undefined): item is ProfileItem & { interval: number } {
  return (
    !!item &&
    item.type === 'remote' &&
    item.autoUpdate !== false &&
    Number.isFinite(item.interval) &&
    Number.isFinite(item.interval! * 60_000) &&
    item.interval! > 0
  )
}

export function createProfileUpdateScheduler(deps: Dependencies) {
  const entries = new Map<string, Entry>()
  const now = deps.now ?? Date.now
  const setTimer =
    deps.setTimer ??
    ((callback, delay) => {
      const timer = setTimeout(callback, delay)
      timer.unref()
      return () => clearTimeout(timer)
    })
  const active = (entry: Entry): boolean => entries.get(entry.id) === entry
  function remove(id: string): void {
    entries.get(id)?.cancel?.()
    entries.delete(id)
  }
  function schedule(entry: Entry, delay: number): void {
    if (!active(entry)) return
    entry.cancel?.()
    entry.cancel = setTimer(
      () => {
        void run(entry)
      },
      Math.min(2_147_483_647, Math.max(0, delay))
    )
  }
  async function run(entry: Entry): Promise<void> {
    if (!active(entry)) return
    try {
      const item = await deps.getItem(entry.id)
      if (!active(entry)) return
      if (!eligible(item)) {
        remove(entry.id)
        return
      }
      const remaining = profileUpdateDelay(item, now())
      if (remaining > 0) {
        schedule(entry, remaining)
        return
      }
      await deps.refresh(item)
      if (!active(entry)) return
      entry.failures = 0
      const latest = await deps.getItem(entry.id)
      if (!active(entry)) return
      if (!eligible(latest)) {
        remove(entry.id)
        return
      }
      schedule(entry, Math.max(1000, profileUpdateDelay(latest, now())))
    } catch (error) {
      if (!active(entry)) return
      deps.onError(entry.id, error)
      entry.failures = Math.min(entry.failures + 1, 10)
      schedule(entry, Math.min(300_000, 30_000 * 2 ** (entry.failures - 1)))
    }
  }
  return {
    upsert(item: ProfileItem): void {
      remove(item.id)
      if (!eligible(item)) return
      const entry: Entry = { id: item.id, failures: 0 }
      entries.set(item.id, entry)
      // Always schedule, including overdue subscriptions; never refresh recursively.
      schedule(entry, profileUpdateDelay(item, now()))
    },
    remove,
    clear(): void {
      for (const id of entries.keys()) remove(id)
    }
  }
}
