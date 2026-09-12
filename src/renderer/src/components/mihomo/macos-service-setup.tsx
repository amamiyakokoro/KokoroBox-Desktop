import { tr } from '../../../../shared/i18n'
import { Button, Card, CardBody, Chip, Divider, Spinner } from '@heroui/react'
import { Modal } from '@heroui-v3/react'
import {
  initService,
  installService,
  openServiceSystemSettings,
  restartCore,
  serviceStatus,
  startService,
  testServiceConnection
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  onChange: (open: boolean) => void
}

type ServiceStatusType = Awaited<ReturnType<typeof serviceStatus>>

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MacOSServiceSetup: React.FC<Props> = ({ onChange }) => {
  const [status, setStatus] = useState<ServiceStatusType | null>(null)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const completing = useRef(false)

  const refresh = useCallback(async (): Promise<boolean> => {
    const nextStatus = await serviceStatus().catch(() => 'unknown' as const)
    const nextConnected =
      nextStatus === 'running' && (await testServiceConnection().catch(() => false))
    setStatus(nextStatus)
    setConnected(nextConnected)
    return nextConnected
  }, [])

  const completeSetup = useCallback(async (): Promise<void> => {
    if (completing.current) return
    completing.current = true
    try {
      await restartCore()
      notify(tr('System service is ready'))
      onChange(false)
    } catch (error) {
      completing.current = false
      notify(error, { variant: 'danger' })
    }
  }, [onChange])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 2000)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (status === 'running' && connected) void completeSetup()
  }, [completeSetup, connected, status])

  const runAction = async (action: () => Promise<unknown> | unknown): Promise<void> => {
    if (loading) return
    setLoading(true)
    try {
      await action()
      await delay(500)
      if (await refresh()) await completeSetup()
    } catch (error) {
      notify(error, { variant: 'danger' })
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const statusText =
    status === null
      ? tr('Checking')
      : status === 'not-installed'
        ? tr('Not registered')
        : status === 'requires-approval'
          ? tr('Awaiting system approval')
          : status === 'need-init'
            ? tr('Waiting for secure initialization')
            : status === 'running' && connected
              ? tr('Ready')
              : status === 'running'
                ? tr('Waiting for secure initialization')
                : status === 'stopped' || status === 'paused'
                  ? tr('Waiting to start')
                  : tr('Needs attention')

  const primaryAction =
    status === 'requires-approval'
      ? {
          label: tr('Open System Settings'),
          run: openServiceSystemSettings,
          color: 'warning' as const
        }
      : status === 'need-init' || status === 'running'
        ? {
            label: tr('Initialize secure connection'),
            run: initService,
            color: 'primary' as const
          }
        : status === 'stopped' || status === 'paused'
          ? { label: tr('Start system service'), run: startService, color: 'primary' as const }
          : {
              label: tr('Set up system service'),
              run: installService,
              color: 'primary' as const
            }

  return (
    <Modal>
      <Modal.Backdrop
        isOpen
        onOpenChange={onChange}
        variant="blur"
        className="top-12 h-[calc(100%-48px)]"
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog className="w-120">
            <Modal.Header className="flex-col gap-1">
              <Modal.Heading>{tr('Complete macOS System Service Setup')}</Modal.Heading>
              <p className="text-sm font-normal text-default-500">
                {tr(
                  'KokoroBox runs the proxy core through a system service by default. Daily launches no longer require elevation after setup.'
                )}
              </p>
            </Modal.Header>
            <Modal.Body className="gap-4">
              <Card shadow="sm" className="border-none bg-default-50">
                <CardBody className="flex-row items-center justify-between py-4">
                  <span className="text-sm font-medium">{tr('Current step')}</span>
                  <Chip
                    size="sm"
                    variant="flat"
                    color={
                      connected ? 'success' : status === 'requires-approval' ? 'warning' : 'primary'
                    }
                    startContent={status === null ? <Spinner size="sm" color="current" /> : null}
                  >
                    {statusText}
                  </Chip>
                </CardBody>
              </Card>

              <ol className="list-decimal space-y-2 pl-5 text-sm text-default-600">
                <li>{tr('Register the signed KokoroBox system service.')}</li>
                <li>
                  {tr('If macOS opens System Settings, allow the KokoroBox background item.')}
                </li>
                <li>
                  {tr(
                    'Return to KokoroBox, initialize the secure connection, and start the proxy core.'
                  )}
                </li>
              </ol>

              <Divider />

              <p className="text-xs leading-5 text-default-500">
                {tr(
                  'The PKG requires administrator authorization once. macOS manages service registration and approval; administrator verification may be requested again only when repairing credentials from an older service.'
                )}
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                size="sm"
                variant="light"
                className="mr-auto"
                isDisabled={loading}
                onPress={() => onChange(false)}
              >
                {tr('Set up later')}
              </Button>
              <Button
                size="sm"
                variant="flat"
                isDisabled={loading}
                onPress={() => void runAction(refresh)}
              >
                {tr('Check again')}
              </Button>
              <Button
                size="sm"
                color={primaryAction.color}
                isLoading={loading}
                onPress={() => void runAction(primaryAction.run)}
              >
                {primaryAction.label}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default MacOSServiceSetup
