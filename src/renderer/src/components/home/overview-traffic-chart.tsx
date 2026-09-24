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

export function overviewTrafficState(
  samples: OverviewTrafficSample[]
): 'unavailable' | 'idle' | 'active' {
  if (samples.length === 0) return 'unavailable'
  return samples.some(({ down, up }) => down > 0 || up > 0) ? 'active' : 'idle'
}

export function overviewTrafficPaths(
  samples: OverviewTrafficSample[],
  now = samples.at(-1)?.index ?? 0
): {
  down: string
  up: string
} {
  const recent = pruneOverviewTrafficHistory(samples, now)
  const visibleMs = Math.min(
    overviewTrafficRetentionMs,
    Math.max(60_000, now - (recent[0]?.index ?? now))
  )
  const visibleStart = now - visibleMs
  const maximum = Math.max(
    1,
    ...recent.flatMap(({ down, up }) =>
      [down, up].filter((value) => Number.isFinite(value) && value > 0)
    )
  )
  const pathFor = (key: 'down' | 'up'): string =>
    recent
      .map((sample, position) => {
        const x = ((sample.index - visibleStart) / visibleMs) * 100
        const value = Number.isFinite(sample[key]) ? Math.max(0, sample[key]) : 0
        const y = 34 - (value / maximum) * 30
        const startsNewSegment = position === 0 || sample.index - recent[position - 1].index > 5_000
        return `${startsNewSegment ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  return { down: pathFor('down'), up: pathFor('up') }
}

export function overviewTrafficRangeSeconds(
  samples: OverviewTrafficSample[],
  now = samples.at(-1)?.index ?? 0
): number | undefined {
  const recent = pruneOverviewTrafficHistory(samples, now)
  if (recent.length < 2) return undefined
  const elapsed = now - recent[0].index
  return Number.isFinite(elapsed) && elapsed > 0
    ? Math.max(1, Math.round(elapsed / 1000))
    : undefined
}

export function OverviewTrafficChart({
  data,
  now
}: {
  data: OverviewTrafficSample[]
  now?: number
}) {
  const paths = overviewTrafficPaths(data, now)
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="absolute inset-x-0 top-0 h-[calc(100%-1.25rem)] w-full"
      aria-hidden="true"
    >
      <path d="M 0 34 H 100" stroke="var(--separator)" strokeWidth="0.5" opacity="0.8" />
      <path d="M 0 19 H 100" stroke="var(--separator)" strokeWidth="0.3" opacity="0.4" />
      <path
        d={paths.down}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={paths.up}
        fill="none"
        stroke="var(--danger)"
        strokeWidth="1.35"
        opacity="0.78"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
