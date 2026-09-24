import { LuAppWindow, LuArrowDown, LuArrowRight, LuArrowUp } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import { tr } from '../../../../shared/i18n'
import type { ActiveApplication } from '../../utils/home-connections'
import type { ApplicationMetadata } from '../../utils/application-metadata'
import { formatOverviewBytes } from './overview-parts'

export function metadataForTopActiveApp(
  application: ActiveApplication,
  resolved: { key: string; value: ApplicationMetadata } | undefined
): ApplicationMetadata | undefined {
  return resolved?.key === application.key ? resolved.value : undefined
}

export function topActiveAppName(
  application: ActiveApplication,
  metadata: ApplicationMetadata | undefined
): string {
  const resolved = metadata?.name?.trim()
  return (
    (application.kind === 'application' ? resolved?.replace(/\.app$/i, '') : resolved) ||
    application.name
  )
}

function ActivityRate({
  direction,
  bytesPerSecond
}: {
  direction: 'down' | 'up'
  bytesPerSecond: number
}) {
  const formatted = formatOverviewBytes(bytesPerSecond)
  const split = formatted.lastIndexOf(' ')
  const Icon = direction === 'down' ? LuArrowDown : LuArrowUp
  return (
    <span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap tabular-nums">
      <Icon
        className={`relative top-0.5 size-3 shrink-0 ${direction === 'down' ? 'text-accent' : 'text-danger'}`}
        aria-hidden="true"
      />
      <span>{formatted.slice(0, split)}</span>
      <span className="text-muted">{formatted.slice(split + 1)}/s</span>
    </span>
  )
}

export function TopActiveAppRow({
  application,
  metadata,
  sampleMs
}: {
  application: ActiveApplication
  metadata?: ApplicationMetadata
  sampleMs: number
}) {
  const name = topActiveAppName(application, metadata)
  const sampleSeconds = (sampleMs / 1000).toFixed(1)
  const explanation = tr('Connection rates use a separate {0} s sample.', [sampleSeconds])
  return (
    <Link
      to="/connections"
      className="home-top-activity app-nodrag group block min-w-0 rounded-lg bg-surface-secondary/35 px-3 py-2 hover:bg-surface-secondary/60 focus-visible:outline-2 focus-visible:outline-accent"
      aria-label={`${tr('Top active app')}: ${name}; ${tr('Download')} ${formatOverviewBytes(application.downloadSpeed)}/s; ${tr('Upload')} ${formatOverviewBytes(application.uploadSpeed)}/s; ${explanation}`}
    >
      <TopActiveAppContent
        application={application}
        metadata={metadata}
        sampleSeconds={sampleSeconds}
        explanation={explanation}
      />
    </Link>
  )
}

export function TopActiveAppContent({
  application,
  metadata,
  sampleSeconds,
  explanation
}: {
  application: ActiveApplication
  metadata?: ApplicationMetadata
  sampleSeconds: string
  explanation: string
}) {
  const name = topActiveAppName(application, metadata)
  return (
    <>
      <span className="block truncate text-[11px] text-muted" title={explanation}>
        {tr('Top active app')} · {tr('{0} s sample', [sampleSeconds])}
      </span>
      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {metadata?.iconUrl ? (
          <img className="size-8 shrink-0 object-contain" src={metadata.iconUrl} alt="" />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-muted">
            <LuAppWindow className="size-4" aria-hidden="true" />
          </span>
        )}
        <span
          className="min-w-[6rem] flex-1 truncate text-sm font-medium text-foreground"
          title={name}
        >
          {name}
        </span>
        <span className="ml-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground">
          <ActivityRate direction="down" bytesPerSecond={application.downloadSpeed} />
          <ActivityRate direction="up" bytesPerSecond={application.uploadSpeed} />
        </span>
        <LuArrowRight
          className="size-3 shrink-0 text-muted group-hover:text-accent"
          aria-hidden="true"
        />
      </span>
    </>
  )
}
