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
      notify(tr('系统服务已准备完成'))
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
      ? tr('检查中')
      : status === 'not-installed'
        ? tr('尚未注册')
        : status === 'requires-approval'
          ? tr('等待系统批准')
          : status === 'need-init'
            ? tr('等待安全初始化')
            : status === 'running' && connected
              ? tr('已准备完成')
              : status === 'running'
                ? tr('等待安全初始化')
                : status === 'stopped' || status === 'paused'
                  ? tr('等待启动')
                  : tr('需要检查')

  const primaryAction =
    status === 'requires-approval'
      ? {
          label: tr('打开系统设置'),
          run: openServiceSystemSettings,
          color: 'warning' as const
        }
      : status === 'need-init' || status === 'running'
        ? {
            label: tr('初始化安全连接'),
            run: initService,
            color: 'primary' as const
          }
        : status === 'stopped' || status === 'paused'
          ? { label: tr('启动系统服务'), run: startService, color: 'primary' as const }
          : {
              label: tr('设置系统服务'),
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
              <Modal.Heading>{tr('完成 macOS 系统服务设置')}</Modal.Heading>
              <p className="text-sm font-normal text-default-500">
                {tr('KokoroBox 默认通过系统服务运行代理核心，完成后日常启动不再要求提权。')}
              </p>
            </Modal.Header>
            <Modal.Body className="gap-4">
              <Card shadow="sm" className="border-none bg-default-50">
                <CardBody className="flex-row items-center justify-between py-4">
                  <span className="text-sm font-medium">{tr('当前步骤')}</span>
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
                <li>{tr('注册 KokoroBox 的签名系统服务。')}</li>
                <li>{tr('若 macOS 打开系统设置，请允许 KokoroBox 后台项目。')}</li>
                <li>{tr('返回 KokoroBox，初始化安全连接并启动代理核心。')}</li>
              </ol>

              <Divider />

              <p className="text-xs leading-5 text-default-500">
                {tr(
                  'PKG 安装会要求一次管理员授权。服务注册与批准由 macOS 管理；只有修复旧服务认证时，系统才可能再次要求管理员验证。'
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
                {tr('稍后设置')}
              </Button>
              <Button
                size="sm"
                variant="flat"
                isDisabled={loading}
                onPress={() => void runAction(refresh)}
              >
                {tr('重新检查')}
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
