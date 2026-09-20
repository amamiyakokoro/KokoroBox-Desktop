import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState, useCallback } from 'react'
import { Button, Card, Chip, Modal, Separator, Spinner } from '@heroui/react'
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
type ServiceAction =
  'refresh' | 'init' | 'install' | 'start' | 'restart' | 'repair' | 'uninstall' | 'open-settings'
type StatusColor = 'default' | 'success' | 'warning' | 'danger'

const statusDotClasses: Record<StatusColor, string> = {
  default: 'bg-muted',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger'
}

function serviceStatusColor(status: ServiceStatusType | null): StatusColor {
  if (status === 'running') return 'success'
  if (
    status === 'stopped' ||
    status === 'paused' ||
    status === 'need-init' ||
    status === 'requires-approval'
  ) {
    return 'warning'
  }
  if (status === 'not-installed') return 'danger'
  return 'default'
}

function connectionStatusColor(status: ConnectionStatusType): StatusColor {
  if (status === 'connected') return 'success'
  if (status === 'disconnected') return 'danger'
  return 'default'
}

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
  const [activeAction, setActiveAction] = useState<ServiceAction | null>(null)
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
    actionName: ServiceAction,
    action: () => Promise<void>,
    isStartAction = false
  ): Promise<void> => {
    setActiveAction(actionName)
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
      setActiveAction(null)
    }
  }

  useEffect(() => {
    void refreshServiceStatus()
  }, [refreshServiceStatus])

  const handleRefresh = async (): Promise<void> => {
    setActiveAction('refresh')
    try {
      await refreshServiceStatus()
    } finally {
      setActiveAction(null)
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

  const serviceTone = serviceStatusColor(status)
  const connectionTone = connectionStatusColor(connectionStatus)
  const isBusy = activeAction !== null
  const hasKnownInstalledService =
    status !== null && status !== 'unknown' && status !== 'not-installed'
  const requiresMacApproval = status === 'requires-approval' && platform === 'darwin'
  const showMaintenance = systemCoreOnlyBuild
    ? hasKnownInstalledService && status !== 'need-init'
    : hasKnownInstalledService && !requiresMacApproval
  const showDangerZone = !systemCoreOnlyBuild && hasKnownInstalledService && !requiresMacApproval

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
              <div className="space-y-5">
                <Card variant="secondary">
                  <Card.Content className="gap-0 py-1">
                    <div className="flex min-h-11 items-center justify-between gap-3 px-1">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`size-2 shrink-0 rounded-full ${statusDotClasses[serviceTone]}`}
                        />
                        <span className="text-sm font-medium">{tr('Service status')}</span>
                      </div>
                      {status === null ? (
                        <Chip color="default" variant="soft" size="sm">
                          <Chip.Label className="flex items-center gap-1">
                            <Spinner size="sm" />
                            {tr('Checking...')}
                          </Chip.Label>
                        </Chip>
                      ) : (
                        <Chip color={serviceTone} variant="soft" size="sm">
                          {getStatusText()}
                        </Chip>
                      )}
                    </div>
                    <Separator />
                    <div className="flex min-h-11 items-center justify-between gap-3 px-1">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`size-2 shrink-0 rounded-full ${statusDotClasses[connectionTone]}`}
                        />
                        <span className="text-sm font-medium">{tr('Connection status')}</span>
                      </div>
                      {connectionStatus === 'checking' ? (
                        <Chip color="default" variant="soft" size="sm">
                          <Chip.Label className="flex items-center gap-1">
                            <Spinner size="sm" />
                            {tr('Detecting...')}
                          </Chip.Label>
                        </Chip>
                      ) : (
                        <Chip color={connectionTone} variant="soft" size="sm">
                          {getConnectionStatusText()}
                        </Chip>
                      )}
                    </div>
                  </Card.Content>
                </Card>

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">KokoroBox Service</h3>
                  <p className="text-xs leading-5 text-muted">
                    {systemCoreOnlyBuild
                      ? tr('Using system service: {0}', [systemServicePath])
                      : tr(
                          'Provides elevated permissions for system proxy settings and core process management'
                        )}
                  </p>
                  <p className="text-xs leading-5 text-muted">
                    {systemCoreOnlyBuild
                      ? tr('The service lifecycle is managed by the distribution init system')
                      : requiresMacApproval
                        ? tr('Allow the KokoroBox background service in System Settings')
                        : tr('Some advanced features are unavailable until installed')}
                  </p>
                </div>

                {showMaintenance && (
                  <section className="space-y-2" aria-labelledby="service-maintenance-heading">
                    <Separator />
                    <h3
                      id="service-maintenance-heading"
                      className="pt-2 text-xs font-semibold text-muted"
                    >
                      {tr('Maintenance')}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {systemCoreOnlyBuild ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={isBusy}
                          isPending={activeAction === 'init'}
                          onPress={() => handleAction('init', onInit)}
                        >
                          {tr('Reset authentication')}
                        </Button>
                      ) : (
                        <>
                          {status !== 'need-init' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              isDisabled={isBusy}
                              isPending={activeAction === 'init'}
                              onPress={() => handleAction('init', onInit)}
                            >
                              {tr('Initialize again')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            isDisabled={isBusy}
                            isPending={activeAction === 'restart'}
                            onPress={() => handleAction('restart', onRestart!, true)}
                          >
                            {tr('Restart')}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            isDisabled={isBusy}
                            isPending={activeAction === 'repair'}
                            onPress={() => handleAction('repair', onInstall!, true)}
                          >
                            {tr('Repair service')}
                          </Button>
                        </>
                      )}
                    </div>
                  </section>
                )}

                {showDangerZone && (
                  <section className="space-y-2" aria-labelledby="service-danger-heading">
                    <Separator />
                    <h3
                      id="service-danger-heading"
                      className="pt-2 text-xs font-semibold text-danger"
                    >
                      {tr('Danger zone')}
                    </h3>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-xs leading-5 text-muted">
                        {tr('Remove KokoroBox Service from this system.')}
                      </p>
                      <Button
                        className="shrink-0"
                        size="sm"
                        variant="danger-soft"
                        isDisabled={isBusy}
                        isPending={activeAction === 'uninstall'}
                        onPress={() => handleAction('uninstall', onUninstall!)}
                      >
                        {tr('Uninstall')}
                      </Button>
                    </div>
                  </section>
                )}
              </div>
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2">
              <Button size="sm" variant="ghost" onPress={() => onChange(false)} isDisabled={isBusy}>
                {tr('Close')}
              </Button>

              {systemCoreOnlyBuild ? (
                status === 'need-init' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    isDisabled={isBusy}
                    isPending={activeAction === 'init'}
                    onPress={() => handleAction('init', onInit)}
                  >
                    {tr('Initialize')}
                  </Button>
                ) : null
              ) : status === 'unknown' ? (
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={isBusy}
                  isPending={activeAction === 'refresh'}
                  onPress={handleRefresh}
                >
                  {tr('Check again')}
                </Button>
              ) : status === 'not-installed' ? (
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={isBusy}
                  isPending={activeAction === 'install'}
                  onPress={() => handleAction('install', onInstall!, true)}
                >
                  {tr('Install service')}
                </Button>
              ) : status === 'requires-approval' && platform === 'darwin' ? (
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={isBusy}
                  isPending={activeAction === 'open-settings'}
                  onPress={() => handleAction('open-settings', openServiceSystemSettings)}
                >
                  {tr('Open System Settings')}
                </Button>
              ) : status === 'need-init' ? (
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={isBusy}
                  isPending={activeAction === 'init'}
                  onPress={() => handleAction('init', onInit)}
                >
                  {tr('Initialize')}
                </Button>
              ) : status === 'stopped' || status === 'paused' || status === 'requires-approval' ? (
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={isBusy}
                  isPending={activeAction === 'start'}
                  onPress={() => handleAction('start', onStart!, true)}
                >
                  {tr('Start')}
                </Button>
              ) : null}
            </Modal.Footer>
            <Modal.CloseTrigger className="app-nodrag" />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default ServiceModal
