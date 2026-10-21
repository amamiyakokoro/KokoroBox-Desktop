import { Button } from '@heroui/react'
import { LuChevronRight } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'
import {
  recoveryActionLabel,
  type RecoveryAction,
  type RuntimeRecoveryGuidance
} from '../../../../shared/runtime-recovery'

export function RecoveryGuidance({
  guidance,
  serviceVersion,
  busy = false,
  compact = false,
  onAction
}: {
  guidance: RuntimeRecoveryGuidance
  serviceVersion?: string
  busy?: boolean
  compact?: boolean
  onAction: (action: RecoveryAction) => void
}) {
  const checkButton = (
    <Button
      size="sm"
      variant="ghost"
      isDisabled={busy}
      isPending={busy}
      onPress={() => onAction('check-again')}
    >
      {tr('Check again')}
    </Button>
  )
  const statusDetails = (
    <>
      <dl className="recovery-status-grid grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
        {guidance.layers.map((layer) => (
          <div
            key={layer.id}
            className="flex min-w-0 items-start justify-between gap-3"
            data-recovery-layer={layer.id}
          >
            <dt className="text-muted">{layer.title}</dt>
            <dd
              className={`text-right font-medium ${layer.state === 'success' ? 'text-success' : layer.state === 'error' ? 'text-danger' : layer.state === 'warning' ? 'text-warning' : 'text-muted'}`}
            >
              {layer.label}
              {layer.id === 'service' && layer.state === 'success' && serviceVersion && (
                <span className="ml-1 font-normal text-muted">{serviceVersion}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {guidance.issue && (
        <div
          className="border-t border-separator/60 pt-3"
          data-recovery-cause={guidance.issue.cause}
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold">{guidance.issue.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{guidance.issue.description}</p>
          {guidance.issue.cause === 'extension-approval' && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-muted">
              <li>
                {tr(
                  'In System Settings, go to General → Login Items & Extensions → Network Extensions.'
                )}
              </li>
              <li>{tr('Enable KokoroBox, then complete the macOS confirmation prompt.')}</li>
              <li>{tr('Return to KokoroBox and select Check again to verify routing.')}</li>
            </ol>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {guidance.issue.actions
              .filter((action) => action !== 'check-again')
              .map((action, index) => (
                <Button
                  key={action}
                  size="sm"
                  variant={index === 0 ? 'primary' : 'secondary'}
                  isDisabled={busy}
                  onPress={() => onAction(action)}
                >
                  {recoveryActionLabel(action)}
                </Button>
              ))}
          </div>
          {guidance.issue.actionHint && (
            <p className="mt-2 text-xs text-muted">{guidance.issue.actionHint}</p>
          )}
        </div>
      )}
      {guidance.checkedAt && (
        <p className="text-[10px] text-muted" role="status" aria-live="polite">
          {tr('Checked at {0}', [new Date(guidance.checkedAt).toLocaleTimeString()])}
        </p>
      )}
    </>
  )
  if (compact) {
    const primaryAction = guidance.issue?.actions.find((action) => action !== 'check-again')
    const attention =
      Boolean(guidance.issue) ||
      guidance.layers.some((layer) => layer.state === 'warning' || layer.state === 'error')
    const summary =
      guidance.issue?.title ??
      guidance.layers.find((layer) => layer.state === 'warning' || layer.state === 'error')
        ?.label ??
      tr('No issues detected')
    return (
      <section aria-label={tr('Status and recovery')} aria-busy={busy} className="min-w-0 px-1">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <details className="group min-w-0 flex-1 basis-60">
            <summary className="flex min-h-8 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded-md text-xs outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              <LuChevronRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-90"
              />
              <span className="shrink-0 font-medium text-muted">{tr('Status and recovery')}</span>
              <span
                role="status"
                aria-live="polite"
                className={attention ? 'text-warning' : 'text-muted'}
              >
                {summary}
              </span>
            </summary>
            <div className="space-y-3 pt-3 pb-1">{statusDetails}</div>
          </details>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {primaryAction && (
              <Button
                size="sm"
                variant="secondary"
                isDisabled={busy}
                onPress={() => onAction(primaryAction)}
              >
                {recoveryActionLabel(primaryAction)}
              </Button>
            )}
            {checkButton}
          </div>
        </div>
      </section>
    )
  }
  return (
    <section aria-label={tr('Status and recovery')} aria-busy={busy} className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{tr('Status and recovery')}</h3>
        {checkButton}
      </div>
      {statusDetails}
    </section>
  )
}
