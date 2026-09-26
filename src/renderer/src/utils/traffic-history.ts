export interface OverviewTrafficSample {
  down: number
  up: number
  index: number
}

export const overviewTrafficRetentionMs = 5 * 60_000
export const overviewTrafficMaximumSamples = 300
export const overviewTrafficStorageKey = 'kokorobox.home.traffic-history.v1'

export function pruneOverviewTrafficHistory(
  samples: OverviewTrafficSample[],
  now: number
): OverviewTrafficSample[] {
  return samples
    .filter(
      ({ index, down, up }) =>
        Number.isFinite(index) &&
        index <= now &&
        index > now - overviewTrafficRetentionMs &&
        Number.isFinite(down) &&
        down >= 0 &&
        Number.isFinite(up) &&
        up >= 0
    )
    .sort((left, right) => left.index - right.index)
    .slice(-overviewTrafficMaximumSamples)
}

export function parseOverviewTrafficHistory(
  value: string | null,
  now: number
): OverviewTrafficSample[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return pruneOverviewTrafficHistory(
      parsed.filter(
        (sample): sample is OverviewTrafficSample => sample !== null && typeof sample === 'object'
      ),
      now
    )
  } catch {
    return []
  }
}
