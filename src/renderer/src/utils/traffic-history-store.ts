import {
  overviewTrafficStorageKey,
  parseOverviewTrafficHistory,
  pruneOverviewTrafficHistory,
  type OverviewTrafficSample
} from './traffic-history'

interface Storage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
export interface TrafficSnapshot {
  history: OverviewTrafficSample[]
  rates?: { up: number; down: number }
  now: number
}
export const trafficPersistenceIntervalMs = 15_000

export function createTrafficHistoryStore(storage: Storage, clock = Date.now) {
  const now = clock()
  let history: OverviewTrafficSample[] = []
  try {
    history = parseOverviewTrafficHistory(storage.getItem(overviewTrafficStorageKey), now)
  } catch {
    // Unavailable storage must not interrupt collection.
  }
  let snapshot: TrafficSnapshot = { history, now }
  let persistedHistory: OverviewTrafficSample[] | undefined
  let lastSampleAt: number | undefined
  let lastLiveAt: number | undefined
  const listeners = new Set<() => void>()
  const publish = (next: TrafficSnapshot): void => {
    snapshot = next
    listeners.forEach((listener) => listener())
  }
  const prune = (now: number): OverviewTrafficSample[] => {
    const next = pruneOverviewTrafficHistory(snapshot.history, now)
    return next.length === snapshot.history.length &&
      next.every((sample, i) => sample === snapshot.history[i])
      ? snapshot.history
      : next
  }
  return {
    getSnapshot: (): TrafficSnapshot => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    receive: (rates: { up: number; down: number }): void => {
      if (![rates.up, rates.down].every((value) => Number.isFinite(value) && value >= 0)) return
      const now = clock()
      lastLiveAt = now
      let history = snapshot.history
      if (lastSampleAt === undefined || now < lastSampleAt || now - lastSampleAt >= 1000) {
        lastSampleAt = now
        history = pruneOverviewTrafficHistory([...history, { ...rates, index: now }], now)
      }
      publish({
        history,
        rates: { up: rates.up, down: rates.down },
        now: history === snapshot.history ? snapshot.now : now
      })
    },
    resetLive: (): void => {
      lastLiveAt = undefined
      lastSampleAt = undefined
      publish({ history: prune(clock()), now: clock() })
    },
    tick: (): void => {
      const now = clock()
      const fresh = lastLiveAt !== undefined && now >= lastLiveAt && now - lastLiveAt <= 5000
      const history = prune(now)
      // Live samples already advance the chart. The timer only advances silent periods.
      if (history === snapshot.history && lastLiveAt !== undefined && now - lastLiveAt < 1500)
        return
      if (!history.length && !snapshot.rates) return
      publish({ history, rates: fresh ? snapshot.rates : undefined, now })
    },
    flush: (): void => {
      if (persistedHistory === snapshot.history) return
      try {
        if (snapshot.history.length)
          storage.setItem(overviewTrafficStorageKey, JSON.stringify(snapshot.history))
        else storage.removeItem(overviewTrafficStorageKey)
        persistedHistory = snapshot.history
      } catch {
        // Retry at the next flush; in-memory history remains available.
      }
    }
  }
}
