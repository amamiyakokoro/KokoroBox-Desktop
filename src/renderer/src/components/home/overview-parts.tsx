import { Chip, Meter } from '@heroui/react'
import type { ReactNode } from 'react'
import { LuArrowRight } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'
import { calcTraffic } from '../../utils/calc'
import { getOutboundModeLabel } from '../sider/outbound-mode'
import type { OverviewServiceFeature } from '../../utils/home-overview'
import { KokoStatusIndicator, type KokoStatusTone } from '../base/koko-status-indicator'

export function OverviewChipGroup({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
}

export function OverviewStat({
  label,
  value,
  secondary,
  icon,
  className = ''
}: {
  label?: ReactNode
  value: ReactNode
  secondary?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex min-w-0 items-start gap-3 ${className}`}>
      {icon}
      <div className="min-w-0 flex-1">
        {label && <div className="text-xs text-muted">{label}</div>}
        <div className="min-w-0 text-xl font-semibold leading-tight tabular-nums text-foreground">
          {value}
        </div>
        {secondary && <div className="mt-0.5 min-w-0 text-sm text-muted">{secondary}</div>}
      </div>
    </div>
  )
}

export function OverviewMetadataRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,6rem)_minmax(0,1fr)] items-baseline gap-3 text-xs leading-5">
      <dt className="min-w-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-foreground">{value}</dd>
    </div>
  )
}

export function OverviewUsageSummary({ usage, quota }: { usage: number; quota: number }) {
  if (quota <= 0) return null
  const percentage = Math.round((usage / quota) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs tabular-nums">
        <span className="text-foreground">
          {calcTraffic(usage)} / {calcTraffic(quota)}
        </span>
        <Chip
          size="sm"
          variant="soft"
          color={percentage >= 100 ? 'danger' : percentage >= 90 ? 'warning' : 'default'}
          className="shrink-0"
        >
          {tr('{0}% used', [percentage])}
        </Chip>
      </div>
      <Meter aria-label={tr('Traffic usage')} maxValue={quota} value={Math.min(usage, quota)}>
        <Meter.Track className="h-1.5 bg-surface-secondary">
          <Meter.Fill className="bg-accent" />
        </Meter.Track>
      </Meter>
      <div className="text-xs tabular-nums text-muted">
        {tr('{0} remaining', [calcTraffic(Math.max(quota - usage, 0))])}
      </div>
    </div>
  )
}

export function OverviewStatusLine({
  label,
  status,
  tone,
  version
}: {
  label: string
  status: string
  tone: KokoStatusTone
  version?: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <KokoStatusIndicator tone={tone}>{status}</KokoStatusIndicator>
      </div>
      {version && <div className="mt-0.5 truncate text-xs text-muted">{version}</div>}
    </div>
  )
}

export function OverviewRoutingChips({
  mode,
  activeRoutes,
  proxy
}: {
  mode: OutboundMode
  activeRoutes: number
  proxy?: { name?: string; protocol?: string; latency?: number }
}) {
  return (
    <OverviewChipGroup>
      <Chip size="sm" variant="soft" color="default">
        {getOutboundModeLabel(mode)}
      </Chip>
      {mode === 'rule' && (
        <Chip size="sm" variant="soft" color="default">
          {activeRoutes > 0
            ? activeRoutes === 1
              ? tr('{0} active route', [activeRoutes])
              : tr('{0} active routes', [activeRoutes])
            : tr('Dynamic')}
        </Chip>
      )}
      {mode === 'global' && proxy?.name && (
        <span className="max-w-full min-w-0 truncate text-xs font-medium" title={proxy.name}>
          {proxy.name}
        </span>
      )}
      {mode === 'global' && !proxy?.name && (
        <span className="text-xs text-muted">{tr('Unavailable')}</span>
      )}
      {mode === 'global' && proxy?.protocol && (
        <Chip size="sm" variant="soft" color="default">
          {proxy.protocol}
        </Chip>
      )}
      {mode === 'global' && proxy?.latency && (
        <Chip size="sm" variant="soft" color="default">
          {proxy.latency} ms
        </Chip>
      )}
    </OverviewChipGroup>
  )
}

export function OverviewSubscriptionChips({ profile }: { profile: ProfileItem }) {
  if (!profile.kokoro) {
    return (
      <OverviewChipGroup>
        <Chip size="sm" variant="soft" color="default">
          {profile.type === 'remote' ? tr('Remote') : tr('Local')}
        </Chip>
      </OverviewChipGroup>
    )
  }
  return (
    <OverviewChipGroup>
      <Chip size="sm" variant="soft" color="accent" title={tr('Kokoro subscription')}>
        Kokoro
      </Chip>
      <Chip size="sm" variant="soft" color="default">
        {profile.kokoro.settings.protocol.toUpperCase()}
      </Chip>
      <Chip size="sm" variant="soft" color="default">
        {profile.kokoro.settings.mode === 'relay' ? tr('Relay') : tr('Direct')}
      </Chip>
    </OverviewChipGroup>
  )
}

export function OverviewServiceChips({ features }: { features: OverviewServiceFeature[] }) {
  if (features.length === 0) return null
  return (
    <OverviewChipGroup>
      {features.map((feature) => (
        <Chip key={feature.kind} size="sm" variant="soft" color="default">
          {feature.kind === 'proxy'
            ? tr('Proxy')
            : feature.kind === 'dns'
              ? 'DNS'
              : feature.count === undefined
                ? tr('App routing')
                : tr('App routing {0}', [feature.count])}
        </Chip>
      ))}
    </OverviewChipGroup>
  )
}

export function OverviewConnectionChip({ count }: { count?: number }) {
  return (
    <Chip size="sm" variant="soft" color="default">
      <Chip.Label className="flex items-center gap-1">
        {count === undefined ? tr('Connections') : tr('{0} connections', [count])}
        <LuArrowRight className="size-3" aria-hidden="true" />
      </Chip.Label>
    </Chip>
  )
}
