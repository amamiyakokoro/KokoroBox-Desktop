import React from 'react'
import { tr } from '../../../../shared/i18n'
import type { ServiceLogEntry } from '../../../../shared/service-log'
import { KokoLogToken } from './log-item'
import { parseLogMessage } from './log-display'
import { serviceLogSummary, serviceLogValue } from './service-log-display'

export function ServiceLogMessage({ entry }: { entry: ServiceLogEntry }): React.ReactNode {
  const fields = entry.fields ?? {}
  const { request, status, duration, important, details } = serviceLogSummary(fields)
  const message = parseLogMessage(entry.message ?? entry.payload)
  const statusTone =
    status !== undefined && status >= 500
      ? 'text-danger'
      : status !== undefined && status >= 400
        ? 'text-warning-soft-foreground'
        : status !== undefined && status >= 200 && status < 300
          ? 'text-success'
          : 'text-accent-soft-foreground'
  return (
    <>
      {(request || status !== undefined || duration) && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {request && (
            <>
              <span className="font-semibold text-accent-soft-foreground">{request.method}</span>
              <span className="min-w-0 break-all font-semibold text-foreground">
                {request.path}
              </span>
            </>
          )}
          {status !== undefined && (
            <span className={`font-semibold tabular-nums ${statusTone}`} title={`HTTP ${status}`}>
              <span className="mr-1 text-[10px] font-normal text-muted">{tr('Status')}</span>
              {status}
            </span>
          )}
          {duration && <span className="text-[11px] text-muted tabular-nums">{duration}</span>}
        </div>
      )}
      <div
        className={`${request ? 'mt-0.5 text-[11px] text-muted' : 'text-foreground'} whitespace-pre-wrap`}
      >
        {message.primary.map((token, index) => (
          <KokoLogToken key={index} token={token} />
        ))}
        {message.secondary?.length ? (
          <div>
            {message.secondary.map((token, index) => (
              <KokoLogToken key={`secondary-${index}`} token={token} />
            ))}
          </div>
        ) : null}
      </div>
      {important.length > 0 && (
        <dl className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
          {important.map(([key, value]) => (
            <div key={key} className="flex min-w-0 max-w-full gap-1.5">
              <dt className="shrink-0 text-muted">{key}</dt>
              <dd
                className={`min-w-0 whitespace-pre-wrap break-all font-medium ${key === 'error' ? 'text-danger' : 'text-foreground'}`}
              >
                {serviceLogValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {details.length > 0 && (
        <details className="mt-0.5 text-[11px] leading-4 text-muted">
          <summary className="w-fit cursor-pointer select-none rounded-sm outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">
            {tr('Details')} <span className="tabular-nums">({details.length})</span>
          </summary>
          <dl className="mt-1 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 border-l border-separator pl-3">
            {details.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-all text-foreground">
                  {serviceLogValue(value)}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </details>
      )}
    </>
  )
}
