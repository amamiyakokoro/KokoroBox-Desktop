import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState, useCallback } from 'react'
import { Button, Spinner, Card, CardBody, Chip, Divider } from '@heroui/react'
import { Modal } from '@heroui-v3/react'
import { serviceStatus, testServiceConnection } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import { systemCoreOnlyBuild, systemServicePath } from '../../../../shared/build-flags'

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
    return 'not-installed'
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
        while (retries > 0 && result === 'stopped') {
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

  const getStatusText = (): string => {
    if (status === null) return tr('检查中')
    switch (status) {
      case 'running':
        return tr('运行中')
      case 'stopped':
        return tr('已停止')
      case 'not-installed':
        return tr('未安装')
      case 'need-init':
        return tr('需要初始化')
      case 'paused':
        return tr('已暂停')
      default:
        return tr('未知状态')
    }
  }

  const getConnectionStatusText = (): string => {
    switch (connectionStatus) {
      case 'connected':
        return tr('已连接')
      case 'disconnected':
        return tr('未连接')
      case 'checking':
        return tr('检测中')
      default:
        return tr('未知')
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
              <Modal.Heading>{tr('KokoroBox 服务管理')}</Modal.Heading>
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
                        <span className="text-sm font-medium">{tr('服务状态')}</span>
                      </div>
                      {status === null ? (
                        <Chip
                          color="default"
                          variant="flat"
                          size="sm"
                          startContent={<Spinner size="sm" color="current" />}
                        >
                          {tr('检查中...')}
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
                        <span className="text-sm font-medium">{tr('连接状态')}</span>
                      </div>
                      {connectionStatus === 'checking' ? (
                        <Chip
                          color="default"
                          variant="flat"
                          size="sm"
                          startContent={<Spinner size="sm" color="current" />}
                        >
                          {tr('检测中...')}
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
                        ? tr('使用系统服务：{0}', [systemServicePath])
                        : tr('提供系统代理设置和核心进程管理的提权功能')}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span>
                      {systemCoreOnlyBuild
                        ? tr('服务生命周期由发行版 init 系统负责管理')
                        : tr('未安装状态下部分高级功能将无法使用')}
                    </span>
                  </div>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer className="flex-col gap-2 sm:flex-row">
              <Button
                size="sm"
                variant="light"
                onPress={() => onChange(false)}
                isDisabled={loading}
                className="sm:mr-auto"
              >
                {tr('关闭')}
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
                    {status === 'need-init' ? tr('初始化') : tr('重置认证')}
                  </Button>
                )
              ) : status === 'unknown' ? null : status === 'not-installed' ? (
                <Button
                  size="sm"
                  color="primary"
                  variant="shadow"
                  onPress={() => handleAction(onInstall!)}
                  isLoading={loading}
                >
                  {tr('安装服务')}
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
                    {status === 'need-init' ? tr('初始化') : tr('重置认证')}
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => handleAction(onRestart!)}
                    isLoading={loading}
                  >
                    {tr('重启')}
                  </Button>
                  {status !== 'running' && status !== 'need-init' ? (
                    <Button
                      size="sm"
                      color="success"
                      variant="shadow"
                      onPress={() => handleAction(onStart!, true)}
                      isLoading={loading}
                    >
                      {tr('启动')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    color="danger"
                    variant="flat"
                    onPress={() => handleAction(onUninstall!)}
                    isLoading={loading}
                  >
                    {tr('卸载')}
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
