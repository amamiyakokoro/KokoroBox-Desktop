import { Button, Modal, Spinner } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import type SpeedTest from '@cloudflare/speedtest'
import type { MeasurementSummary } from '@cloudflare/speedtest'
import { LuGauge } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'

function SpeedTestDialog({ onClose }: { onClose: () => void }) {
  const engine = useRef<SpeedTest | null>(null)
  const generation = useRef(0)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<MeasurementSummary>({})
  const [error, setError] = useState(false)
  const stop = () => {
    generation.current++
    engine.current?.pause()
    engine.current = null
    setRunning(false)
  }
  useEffect(
    () => () => {
      generation.current++
      engine.current?.pause()
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
      const { default: CloudflareSpeedTest } = await import('@cloudflare/speedtest')
      if (current !== generation.current) return
      const test = new CloudflareSpeedTest({
        autoStart: false,
        logAimApiUrl: null,
        logMeasurementApiUrl: null,
        measurements: [
          { type: 'latency', numPackets: 10 },
          { type: 'download', bytes: 100_000, count: 3 },
          { type: 'download', bytes: 1_000_000, count: 3 },
          { type: 'download', bytes: 10_000_000, count: 3 },
          { type: 'upload', bytes: 100_000, count: 3 },
          { type: 'upload', bytes: 1_000_000, count: 3 },
          { type: 'upload', bytes: 10_000_000, count: 3 }
        ]
      })
      engine.current = test
      test.onResultsChange = () => {
        if (current === generation.current) setResults(test.results.getSummary())
      }
      test.onFinish = (result) => {
        if (current !== generation.current) return
        setResults(result.getSummary())
        stop()
      }
      test.onError = () => {
        if (current !== generation.current) return
        setError(true)
        stop()
      }
      test.play()
    } catch {
      if (current !== generation.current) return
      setError(true)
      stop()
    }
  }
  const metrics = [
    [tr('Download'), results.download, 1_000_000, 'Mbps'],
    [tr('Upload'), results.upload, 1_000_000, 'Mbps'],
    [tr('Latency'), results.latency, 1, 'ms'],
    [tr('Jitter'), results.jitter, 1, 'ms']
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
                {tr('Test your current connection with Cloudflare. Uses about 67 MB of data.')}
              </p>
              <div className="grid grid-cols-2 gap-4" aria-live="polite">
                {metrics.map(([label, value, divisor, unit]) => (
                  <div key={label} className="rounded-xl bg-surface-secondary p-3">
                    <div className="text-xs text-muted">{label}</div>
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

export default function OverviewSpeedTest() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="tertiary" className="app-nodrag" onPress={() => setOpen(true)}>
        <LuGauge className="size-4" aria-hidden="true" />
        {tr('Speed test')}
      </Button>
      {open && <SpeedTestDialog onClose={() => setOpen(false)} />}
    </>
  )
}
