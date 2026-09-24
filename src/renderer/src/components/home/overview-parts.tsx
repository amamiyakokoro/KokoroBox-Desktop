import { Chip, Meter } from '@heroui/react'
import type { ReactNode } from 'react'
import { LuAppWindow, LuArrowRight, LuGlobe, LuNetwork } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'
import { maskPublicIp } from '../../../../shared/home'
import { calcTraffic } from '../../utils/calc'
import { getOutboundModeLabel } from '../sider/outbound-mode'
import type { OverviewConfiguredFeature } from '../../utils/home-overview'
import { KokoStatusIndicator, type KokoStatusTone } from '../base/koko-status-indicator'

export function OverviewChipGroup({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
}

export function OverviewPublicIp({
  ip,
  revealed,
  onToggle
}: {
  ip: string
  revealed: boolean
  onToggle: () => void
}) {
  const action = revealed ? tr('Hide IP address') : tr('Reveal IP address')
  return (
    <button
      type="button"
      title={action}
      aria-label={action}
      aria-pressed={revealed}
      onClick={onToggle}
      className="app-nodrag block max-w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md text-left font-mono text-[clamp(1.5rem,4.2cqw,1.875rem)] font-semibold leading-tight tabular-nums text-foreground outline-offset-2 hover:bg-accent-soft/35 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {revealed ? ip : maskPublicIp(ip)}
    </button>
  )
}

export function OverviewStat({
  label,
  value,
  secondary,
  icon,
  className = '',
  valueClassName = '',
  secondaryClassName = ''
}: {
  label?: ReactNode
  value: ReactNode
  secondary?: ReactNode
  icon?: ReactNode
  className?: string
  valueClassName?: string
  secondaryClassName?: string
}) {
  return (
    <div className={`flex min-w-0 items-start gap-3 ${className}`}>
      {icon}
      <div className="min-w-0 flex-1">
        {label && <div className="text-xs text-muted">{label}</div>}
        <div
          className={`min-w-0 font-semibold leading-tight tabular-nums text-foreground ${label ? 'mt-0.5' : ''} ${valueClassName || 'text-xl'}`}
        >
          {value}
        </div>
        {secondary && (
          <div
            className={`home-secondary-value mt-1 min-w-0 text-muted ${secondaryClassName || 'text-sm'}`}
          >
            {secondary}
          </div>
        )}
      </div>
    </div>
  )
}

export function OverviewMetadataRow({
  label,
  value,
  icon
}: {
  label: ReactNode
  value: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-baseline gap-1.5 text-xs leading-5">
      <dt className="flex min-w-0 items-center gap-1 text-muted">
        {icon}
        <span>{label}</span>
      </dt>
      <dd className="min-w-0 break-words text-right text-foreground">{value}</dd>
    </div>
  )
}

export function formatOverviewBytes(bytes: number): string {
  return Number.isFinite(bytes) && bytes > 0 ? calcTraffic(bytes) : '0 B'
}

export function OverviewTrafficRate({ bytesPerSecond }: { bytesPerSecond?: number }) {
  if (bytesPerSecond === undefined) return <span className="text-muted">—</span>
  const formatted = formatOverviewBytes(bytesPerSecond)
  const unitIndex = formatted.lastIndexOf(' ')
  return (
    <>
      <span>{formatted.slice(0, unitIndex)}</span>
      <span className="ml-1 text-sm font-normal text-muted">
        {formatted.slice(unitIndex + 1)}/s
      </span>
    </>
  )
}

export function OverviewUsageSummary({ usage, quota }: { usage: number; quota: number }) {
  if (quota <= 0) return null
  const percentage = Math.round((usage / quota) * 100)
  return (
    <div className="home-overview-subpanel space-y-2 rounded-xl px-3 py-3">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 tabular-nums">
        <span className="min-w-0 whitespace-nowrap">
          <span className="sr-only">{tr('Used traffic')} </span>
          <strong className="text-2xl font-semibold leading-none text-foreground">
            {formatOverviewBytes(usage)}
          </strong>
          <span className="ml-1 text-sm text-muted">/ {formatOverviewBytes(quota)}</span>
        </span>
        <span
          aria-label={tr('{0}% used', [percentage])}
          className={`shrink-0 rounded-full bg-surface-secondary/60 px-2 py-0.5 text-xs font-medium ${percentage >= 100 ? 'text-danger' : percentage >= 90 ? 'text-warning' : 'text-foreground'}`}
        >
          {percentage}%
        </span>
      </div>
      <Meter
        aria-label={tr('Traffic usage')}
        maxValue={quota}
        value={Math.min(Math.max(usage, 0), quota)}
      >
        <Meter.Track className="h-1.5 bg-surface-secondary">
          <Meter.Fill className={percentage >= 100 ? 'bg-danger' : 'bg-accent'} />
        </Meter.Track>
      </Meter>
      <div className="home-secondary-value text-xs tabular-nums text-muted">
        {tr('{0} remaining', [formatOverviewBytes(Math.max(quota - usage, 0))])}
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
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-muted">{label}</span>
        <KokoStatusIndicator tone={tone}>{status}</KokoStatusIndicator>
      </div>
      {version && (
        <div className="home-secondary-value mt-0.5 truncate text-xs text-muted">{version}</div>
      )}
    </div>
  )
}

export function OverviewRoutingChip({ mode }: { mode: OutboundMode }) {
  return (
    <Chip size="sm" variant="soft" color="accent">
      {getOutboundModeLabel(mode)}
    </Chip>
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
      <Chip size="sm" variant="soft" color="default" title={tr('Subscription connection mode')}>
        {profile.kokoro.settings.mode === 'relay' ? tr('Relay') : tr('Direct')}
      </Chip>
    </OverviewChipGroup>
  )
}

export function OverviewConfiguredChips({ features }: { features: OverviewConfiguredFeature[] }) {
  if (features.length === 0) return null
  return (
    <OverviewChipGroup>
      {features.map((feature) => (
        <Chip key={feature.kind} size="sm" variant="soft" color="default">
          <Chip.Label className="home-secondary-value flex items-center gap-1">
            {feature.kind === 'proxy' ? (
              <LuGlobe className="size-3" aria-hidden="true" />
            ) : feature.kind === 'dns' ? (
              <LuNetwork className="size-3" aria-hidden="true" />
            ) : (
              <LuAppWindow className="size-3" aria-hidden="true" />
            )}
            <span>
              {feature.kind === 'proxy'
                ? tr('Proxy')
                : feature.kind === 'dns'
                  ? 'DNS'
                  : tr('App routing')}
            </span>
            {feature.kind === 'app-routing' && feature.count !== undefined && (
              <span className="ml-0.5 inline-flex min-w-4 justify-center rounded-full bg-surface-secondary px-1 text-[10px] leading-4 tabular-nums text-muted">
                {feature.count}
              </span>
            )}
          </Chip.Label>
        </Chip>
      ))}
    </OverviewChipGroup>
  )
}

export function overviewConnectionLabel(count?: number): string {
  if (count === undefined) return tr('Connections')
  return count === 1 ? tr('1 connection') : tr('{0} connections', [count])
}

export function OverviewConnectionAction({ count }: { count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors group-hover:text-accent">
      {overviewConnectionLabel(count)}
      <LuArrowRight className="size-3" aria-hidden="true" />
    </span>
  )
}
