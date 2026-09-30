import { Button, Modal } from '@heroui/react'
import React, { useEffect, useRef, useState } from 'react'
import { tr } from '../../../../shared/i18n'
import type {
  DiagnosticAction,
  DiagnosticStatus,
  SystemProxyDiagnostics
} from '../../../../shared/system-proxy-diagnostics'
import { fixSystemProxyDiagnostic, runSystemProxyDiagnostics } from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'

const statusStyles: Record<DiagnosticStatus, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
  info: 'text-muted'
}
const statusSymbols: Record<DiagnosticStatus, string> = {
  success: '✓',
  warning: '!',
  error: '×',
  info: 'ℹ'
}
const statusLabels: Record<DiagnosticStatus, string> = {
  success: tr('Success'),
  warning: tr('Warning'),
  error: tr('Error'),
  info: tr('Information')
}
const actionLabels: Record<DiagnosticAction, string> = {
  'enable-system-proxy': tr('Enable system proxy'),
  'restore-system-proxy': tr('Restore KokoroBox proxy settings'),
  'start-core': tr('Start core'),
  'restart-core': tr('Restart core')
}

const SystemProxyDiagnosticsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [result, setResult] = useState<SystemProxyDiagnostics>()
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const active = useRef(false)
  const pending = useRef(false)
  const { mutateAppConfig } = useAppConfig()

  const run = async (action?: DiagnosticAction): Promise<void> => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      if (action) {
        await fixSystemProxyDiagnostic(action)
        await mutateAppConfig()
      }
      const next = await runSystemProxyDiagnostics()
      if (active.current) setResult(next)
    } catch {
      if (active.current)
        setError(
          action
            ? tr(
                'The suggested fix could not be completed. Refresh diagnostics and inspect the service or core logs.'
              )
            : tr(
                'Diagnostics could not be completed. Check the service and core logs, then run again.'
              )
        )
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }

  useEffect(() => {
    active.current = true
    void run()
    return () => {
      active.current = false
    }
  }, [])

  const copy = async (): Promise<void> => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.report)
      if (active.current) setCopied(true)
    } catch {
      if (active.current) setError(tr('Unable to copy diagnostic report'))
    }
  }

  return (
    <Modal>
      <Modal.Backdrop
        isOpen
        onOpenChange={onClose}
        variant="blur"
        className="top-12 h-[calc(100%-48px)]"
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog className="mt-4 max-h-[calc(100%-32px)] w-[min(660px,calc(100%-32px))]">
            <Modal.Header className="app-drag">
              <Modal.Heading>{tr('System Proxy Diagnostics')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="gap-3" aria-busy={busy}>
              <p className="text-xs leading-5 text-muted">
                {tr(
                  'Checks saved settings and actual proxy health. Each run makes one public HTTPS connectivity request. Settings change only when you select a suggested fix.'
                )}
              </p>
              <div role="status" aria-live="polite">
                {busy ? (
                  <p className="py-2 text-sm font-medium">{tr('Running diagnostics...')}</p>
                ) : result ? (
                  <>
                    <p className={`text-sm font-medium ${statusStyles[result.overall.status]}`}>
                      {result.overall.summary}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {tr('Checked at {0}', [new Date(result.checkedAt).toLocaleTimeString()])}
                    </p>
                  </>
                ) : null}
              </div>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              {result && !busy && (
                <div className="divide-y divide-separator/60">
                  {result.results.map((check) => (
                    <div
                      key={check.id}
                      className="flex items-start gap-3 py-3"
                      data-diagnostic-status={check.status}
                    >
                      <span
                        className={`mt-0.5 w-4 shrink-0 text-center text-sm ${statusStyles[check.status]}`}
                        role="img"
                        aria-label={statusLabels[check.status]}
                      >
                        {statusSymbols[check.status]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{check.title}</p>
                        <p className="mt-0.5 text-sm">{check.summary}</p>
                        {check.details && (
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted">
                            {check.details}
                          </p>
                        )}
                        {check.action && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              isDisabled={busy}
                              onPress={() => void run(check.action)}
                            >
                              {actionLabels[check.action]}
                            </Button>
                            {check.actionHint && (
                              <span className="text-xs text-muted">{check.actionHint}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Modal.Body>
            <Modal.Footer className="flex-wrap">
              <Button
                size="sm"
                variant="ghost"
                isDisabled={busy || !result}
                onPress={() => void copy()}
              >
                {copied ? tr('Copied') : tr('Copy diagnostic report')}
              </Button>
              <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => void run()}>
                {tr('Run again')}
              </Button>
              <Button size="sm" variant="secondary" onPress={onClose}>
                {tr('Close')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default SystemProxyDiagnosticsModal
