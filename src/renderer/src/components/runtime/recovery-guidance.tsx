import { Button } from '@heroui/react'
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
  onAction
}: {
  guidance: RuntimeRecoveryGuidance
  serviceVersion?: string
  busy?: boolean
  onAction: (action: RecoveryAction) => void
}) {
  return (
    <section aria-label={tr('Status and recovery')} aria-busy={busy} className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{tr('Status and recovery')}</h3>
        <Button
          size="sm"
          variant="ghost"
          isDisabled={busy}
          isPending={busy}
          onPress={() => onAction('check-again')}
        >
          {tr('Check again')}
        </Button>
      </div>
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
    </section>
  )
}
