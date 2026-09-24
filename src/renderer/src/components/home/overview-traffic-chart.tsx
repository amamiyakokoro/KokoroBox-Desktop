export interface OverviewTrafficSample {
  down: number
  up: number
  index: number
}

export function overviewTrafficState(
  samples: OverviewTrafficSample[]
): 'unavailable' | 'idle' | 'active' {
  if (samples.length === 0) return 'unavailable'
  return samples.some(({ down, up }) => down > 0 || up > 0) ? 'active' : 'idle'
}

export function overviewTrafficPaths(samples: OverviewTrafficSample[]): {
  down: string
  up: string
} {
  const recent = samples.slice(-60)
  const maximum = Math.max(
    1,
    ...recent.flatMap(({ down, up }) =>
      [down, up].filter((value) => Number.isFinite(value) && value > 0)
    )
  )
  const pathFor = (key: 'down' | 'up'): string =>
    recent
      .map((sample, position) => {
        const x = ((60 - recent.length + position) / 59) * 100
        const value = Number.isFinite(sample[key]) ? Math.max(0, sample[key]) : 0
        const y = 34 - (value / maximum) * 30
        return `${position === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  return { down: pathFor('down'), up: pathFor('up') }
}

export function overviewTrafficRangeSeconds(samples: OverviewTrafficSample[]): number | undefined {
  const recent = samples.slice(-60)
  if (recent.length < 2) return undefined
  const elapsed = recent.at(-1)!.index - recent[0].index
  return Number.isFinite(elapsed) && elapsed > 0
    ? Math.max(1, Math.round(elapsed / 1000))
    : undefined
}

export function OverviewTrafficChart({ data }: { data: OverviewTrafficSample[] }) {
  const paths = overviewTrafficPaths(data)
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
