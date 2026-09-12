import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState, useCallback } from 'react'
import { Button, Spinner, Card, CardBody, Chip, Divider } from '@heroui/react'
import { Modal } from '@heroui-v3/react'
import {
  openServiceSystemSettings,
  serviceStatus,
  testServiceConnection
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import { systemCoreOnlyBuild, systemServicePath } from '../../../../shared/build-flags'
import { platform } from '@renderer/utils/init'

interface Props {
  onChange: (open: boolean) => void
  onInit: () => Promise<void>
  onInstall?: () => Promise<void>
  onUninstall?: () => Promise<void>
  onStart?: () => Promise<void>
  onRestart?: () => Promise<void>
}

type ServiceStatusType = Awaited<ReturnType<typeof serviceStatus>>
type ConnectionStatusType = 'connected' | 'disconnected' | 'checking' | 'unknown'

function isUserCancelledError(error: unknown): boolean {
  const errorMsg = String(error)
  return /(?:用户|用戶|使用者)取消操作/.test(errorMsg) || errorMsg.includes('UserCancelledError')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function readServiceStatus(): Promise<ServiceStatusType> {
  try {
    return await serviceStatus()
  } catch {
    return 'unknown'
  }
}

const ServiceModal: React.FC<Props> = (props) => {
  const { onChange, onInit, onInstall, onUninstall, onStart, onRestart } = props
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<ServiceStatusType | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>('checking')

  const refreshServiceStatus = useCallback(async (nextStatus?: ServiceStatusType) => {
    const result = nextStatus ?? (await readServiceStatus())
    setStatus(result)

    if (result !== 'running') {
      setConnectionStatus('disconnected')
      return result
    }

    setConnectionStatus('checking')
    const connected = await testServiceConnection().catch(() => false)
    setConnectionStatus(connected ? 'connected' : 'disconnected')
    return result
  }, [])

  const handleAction = async (
    action: () => Promise<void>,
    isStartAction = false
  ): Promise<void> => {
    setLoading(true)
    try {
      await action()

      await delay(500)

      let result = await readServiceStatus()

      if (isStartAction) {
        let retries = 5
        while (retries > 0 && (result === 'stopped' || result === 'unknown')) {
          await delay(1000)
          result = await readServiceStatus()
          retries--
        }
      }

      await refreshServiceStatus(result)
    } catch (e) {
      await refreshServiceStatus()
      if (!isUserCancelledError(e)) notify(e, { variant: 'danger' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshServiceStatus()
  }, [refreshServiceStatus])

  const handleRefresh = async (): Promise<void> => {
    setLoading(true)
    try {
      await refreshServiceStatus()
    } finally {
      setLoading(false)
    }
  }

  const getStatusText = (): string => {
    if (status === null) return tr('Checking')
    switch (status) {
      case 'running':
        return tr('Running')
      case 'stopped':
        return tr('Stopped')
      case 'not-installed':
        return tr('Not installed')
      case 'requires-approval':
        return tr('Awaiting system approval')
      case 'need-init':
        return tr('Initialization required')
      case 'paused':
        return tr('Paused')
      default:
        return tr('Unknown status')
    }
  }

  const getConnectionStatusText = (): string => {
    switch (connectionStatus) {
      case 'connected':
        return tr('Connected')
      case 'disconnected':
        return tr('Not connected')
      case 'checking':
        return tr('Detecting')
      default:
        return tr('Unknown')
    }
  }

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={true}
        onOpenChange={onChange}
        variant="blur"
        className="top-12 h-[calc(100%-48px)]"
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog className="w-112.5">
            <Modal.Header className="flex-col gap-1">
              <Modal.Heading>{tr('KokoroBox service management')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="space-y-4">
                <Card
                  shadow="sm"
                  className="border-none bg-linear-to-br from-default-50 to-default-100"
                >
                  <CardBody className="py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{tr('Service status')}</span>
                      </div>
                      {status === null ? (
                        <Chip
                          color="default"
                          variant="flat"
                          size="sm"
                          startContent={<Spinner size="sm" color="current" />}
                        >
                          {tr('Checking...')}
                        </Chip>
                      ) : (
                        <Chip
                          color={
                            status === 'running'
                              ? 'success'
                              : status === 'stopped'
                                ? 'warning'
                                : status === 'not-installed'
                                  ? 'danger'
                                  : status === 'requires-approval'
                                    ? 'warning'
                                    : status === 'need-init'
                                      ? 'warning'
                                      : 'default'
                          }
                          variant="flat"
                          size="sm"
                        >
                          {getStatusText()}
                        </Chip>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{tr('Connection status')}</span>
                      </div>
                      {connectionStatus === 'checking' ? (
                        <Chip
                          color="default"
                          variant="flat"
                          size="sm"
                          startContent={<Spinner size="sm" color="current" />}
                        >
                          {tr('Detecting...')}
                        </Chip>
                      ) : (
                        <Chip
                          color={
                            connectionStatus === 'connected'
                              ? 'success'
                              : connectionStatus === 'disconnected'
                                ? 'danger'
                                : 'default'
                          }
                          variant="flat"
                          size="sm"
                        >
                          {getConnectionStatusText()}
                        </Chip>
                      )}
                    </div>
                  </CardBody>
                </Card>

                <Divider />

                <div className="text-xs text-default-500 space-y-2">
                  <div className="flex items-start gap-2">
                    <span>
                      {systemCoreOnlyBuild
                        ? tr('Using system service: {0}', [systemServicePath])
                        : tr(
                            'Provides elevated permissions for system proxy settings and core process management'
                          )}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span>
                      {systemCoreOnlyBuild
                        ? tr('The service lifecycle is managed by the distribution init system')
                        : status === 'requires-approval' && platform === 'darwin'
                          ? tr('Allow the KokoroBox background service in System Settings')
                          : tr('Some advanced features are unavailable until installed')}
                    </span>
                  </div>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer className="flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                size="sm"
                variant="light"
                onPress={() => onChange(false)}
                isDisabled={loading}
                className="sm:mr-auto"
              >
                {tr('Close')}
              </Button>

              {systemCoreOnlyBuild ? (
                status === null || status === 'unknown' || status === 'not-installed' ? null : (
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => handleAction(onInit)}
                    isLoading={loading}
                  >
                    {status === 'need-init' ? tr('Initialize') : tr('Reset authentication')}
                  </Button>
                )
              ) : status === 'unknown' ? (
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  onPress={handleRefresh}
                  isLoading={loading}
                >
                  {tr('Check again')}
                </Button>
              ) : status === 'not-installed' ? (
                <Button
                  size="sm"
                  color="primary"
                  variant="shadow"
                  onPress={() => handleAction(onInstall!, true)}
                  isLoading={loading}
                >
                  {tr('Install service')}
                </Button>
              ) : status === 'requires-approval' && platform === 'darwin' ? (
                <Button
                  size="sm"
                  color="warning"
                  variant="flat"
                  onPress={() => handleAction(openServiceSystemSettings)}
                  isLoading={loading}
                >
                  {tr('Open System Settings')}
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => handleAction(onInit)}
                    isLoading={loading}
                  >
                    {status === 'need-init' ? tr('Initialize') : tr('Initialize again')}
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => handleAction(onRestart!, true)}
                    isLoading={loading}
                  >
                    {tr('Restart')}
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => handleAction(onInstall!, true)}
                    isLoading={loading}
                  >
                    {tr('Repair service')}
                  </Button>
                  {status !== 'running' && status !== 'need-init' ? (
                    <Button
                      size="sm"
                      color="success"
                      variant="shadow"
                      onPress={() => handleAction(onStart!, true)}
                      isLoading={loading}
                    >
                      {tr('Start')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    color="danger"
                    variant="flat"
                    onPress={() => handleAction(onUninstall!)}
                    isLoading={loading}
                  >
                    {tr('Uninstall')}
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default ServiceModal
