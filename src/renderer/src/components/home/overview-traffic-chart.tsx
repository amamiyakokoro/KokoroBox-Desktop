import { memo } from 'react'
import {
  pruneOverviewTrafficHistory,
  overviewTrafficRetentionMs,
  type OverviewTrafficSample
} from '../../utils/traffic-history'
export {
  overviewTrafficMaximumSamples,
  overviewTrafficRetentionMs,
  overviewTrafficStorageKey,
  parseOverviewTrafficHistory,
  pruneOverviewTrafficHistory,
  type OverviewTrafficSample
} from '../../utils/traffic-history'

export function overviewTrafficState(
  samples: OverviewTrafficSample[]
): 'unavailable' | 'idle' | 'active' {
  if (samples.length === 0) return 'unavailable'
  return samples.some(({ down, up }) => down > 0 || up > 0) ? 'active' : 'idle'
}

function overviewTrafficGeometry(
  samples: OverviewTrafficSample[],
  now = samples.at(-1)?.index ?? 0
) {
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
  const segments: OverviewTrafficSample[][] = []
  for (const sample of recent) {
    const segment = segments.at(-1)
    if (!segment || sample.index - segment.at(-1)!.index > 5_000) {
      segments.push([sample])
    } else {
      segment.push(sample)
    }
  }
  const point = (sample: OverviewTrafficSample, key: 'down' | 'up') => {
    const x = ((sample.index - visibleStart) / visibleMs) * 100
    const y = 34 - (sample[key] / maximum) * 30
    return `${x.toFixed(2)} ${y.toFixed(2)}`
  }
  const baselineX = (sample: OverviewTrafficSample) =>
    (((sample.index - visibleStart) / visibleMs) * 100).toFixed(2)
  const lineFor = (key: 'down' | 'up') =>
    segments
      .map((segment) =>
        segment
          .map((sample, position) => `${position === 0 ? 'M' : 'L'} ${point(sample, key)}`)
          .join(' ')
      )
      .join(' ')
  const areaFor = (key: 'down' | 'up') =>
    segments
      .filter((segment) => segment.length > 1)
      .map(
        (segment) =>
          `M ${baselineX(segment[0])} 34 L ${segment.map((sample) => point(sample, key)).join(' L ')} L ${baselineX(segment.at(-1)!)} 34 Z`
      )
      .join(' ')
  return {
    lines: { down: lineFor('down'), up: lineFor('up') },
    areas: { down: areaFor('down'), up: areaFor('up') }
  }
}

export function overviewTrafficPaths(
  samples: OverviewTrafficSample[],
  now = samples.at(-1)?.index ?? 0
): { down: string; up: string } {
  return overviewTrafficGeometry(samples, now).lines
}

export function overviewTrafficAreaPaths(
  samples: OverviewTrafficSample[],
  now = samples.at(-1)?.index ?? 0
): { down: string; up: string } {
  return overviewTrafficGeometry(samples, now).areas
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

export const OverviewTrafficChart = memo(function OverviewTrafficChart({
  data,
  now
}: {
  data: OverviewTrafficSample[]
  now?: number
}) {
  const { lines, areas } = overviewTrafficGeometry(data, now)
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="absolute inset-x-0 top-0 h-[calc(100%-1.25rem)] w-full"
      aria-hidden="true"
    >
      <path d={areas.down} fill="var(--accent)" fillOpacity="0.07" />
      <path d={areas.up} fill="var(--danger)" fillOpacity="0.06" />
      <path d="M 0 19 H 100" stroke="var(--separator)" strokeWidth="0.35" opacity="0.28" />
      <path d="M 0 34 H 100" stroke="var(--separator)" strokeWidth="0.35" opacity="0.28" />
      <path
        d={lines.down}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={lines.up}
        fill="none"
        stroke="var(--danger)"
        strokeWidth="1.2"
        opacity="0.78"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
})
