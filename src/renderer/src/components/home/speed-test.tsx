import { Button, Modal, Spinner } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import { runCloudflareSpeedTest, type SpeedTestResult } from '../../utils/cloudflare-speed-test'
import { LuActivity, LuClock3, LuDownload, LuGauge, LuUpload } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'

export type CompletedSpeedTestResult = SpeedTestResult & { download: number; upload: number }

function SpeedTestDialog({
  onClose,
  onComplete
}: {
  onClose: () => void
  onComplete: (result: CompletedSpeedTestResult) => void
}) {
  const engine = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<SpeedTestResult>({})
  const [error, setError] = useState(false)
  const stop = () => {
    generation.current++
    engine.current?.abort()
    engine.current = null
    setRunning(false)
  }
  useEffect(
    () => () => {
      generation.current++
      engine.current?.abort()
    },
    []
  )

  const start = async () => {
    stop()
    const current = generation.current
    setRunning(true)
    setError(false)
    setResults({})
    try {
      const controller = new AbortController()
      engine.current = controller
      const result = await runCloudflareSpeedTest({
        signal: controller.signal,
        onProgress: (next) => {
          if (current !== generation.current) return
          setResults(next)
        }
      })
      if (current !== generation.current) return
      setResults(result)
      if (
        result.download !== undefined &&
        result.upload !== undefined &&
        Number.isFinite(result.download) &&
        Number.isFinite(result.upload)
      ) {
        onComplete({ ...result, download: result.download, upload: result.upload })
      }
      stop()
    } catch {
      if (current !== generation.current) return
      setError(true)
      stop()
    }
  }
  const metrics = [
    [tr('Download'), results.download, 1_000_000, 'Mbps', LuDownload],
    [tr('Upload'), results.upload, 1_000_000, 'Mbps', LuUpload],
    [tr('Latency'), results.latency, 1, 'ms', LuClock3],
    [tr('Jitter'), results.jitter, 1, 'ms', LuActivity]
  ] as const
  return (
    <Modal>
      <Modal.Backdrop
        isOpen
        onOpenChange={(open) => {
          if (!open) {
            stop()
            onClose()
          }
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-md">
            <Modal.Header className="flex-row items-center gap-2">
              <Modal.Heading>{tr('Speed test')}</Modal.Heading>
              {running && <Spinner size="sm" aria-label={tr('Testing speed')} />}
            </Modal.Header>
            <Modal.Body className="space-y-4">
              <p className="text-sm text-muted">
                {tr(
                  'Test your current connection with Cloudflare. Uses up to about 64 MB of data.'
                )}
              </p>
              <div className="grid grid-cols-2 gap-4" aria-live="polite">
                {metrics.map(([label, value, divisor, unit, Icon]) => (
                  <div key={label} className="rounded-xl bg-surface-secondary p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                      {label}
                    </div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">
                      {value !== undefined && Number.isFinite(value)
                        ? (value / divisor).toFixed(1)
                        : '—'}
                      <span className="ml-1 text-xs font-normal text-muted">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {tr('Speed test failed. Check your connection and try again.')}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="tertiary"
                onPress={() => {
                  stop()
                  onClose()
                }}
              >
                {tr('Close')}
              </Button>
              <Button onPress={running ? stop : () => void start()}>
                {running ? tr('Stop') : tr('Start test')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default function OverviewSpeedTest({
  onComplete
}: {
  onComplete: (result: CompletedSpeedTestResult) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="tertiary" className="app-nodrag" onPress={() => setOpen(true)}>
        <LuGauge className="size-4" aria-hidden="true" />
        {tr('Speed test')}
      </Button>
      {open && <SpeedTestDialog onClose={() => setOpen(false)} onComplete={onComplete} />}
    </>
  )
}
