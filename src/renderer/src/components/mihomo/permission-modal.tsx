import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState } from 'react'
import { Button, Card, CardBody, CardHeader, Chip, Divider } from '@heroui/react'
import { Modal } from '@heroui-v3/react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  checkCorePermission,
  checkElevateTask,
  manualGrantCorePermition,
  relaunchWindowsElevated,
  relaunchWindowsUnelevated,
  revokeCorePermission
} from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import { notify } from '@renderer/utils/notification'

interface Props {
  onChange: (open: boolean) => void
}

const PermissionModal: React.FC<Props> = (props) => {
  const { onChange } = props
  useAppConfig()
  const [loading, setLoading] = useState<{ mihomo?: boolean; 'mihomo-alpha'?: boolean }>({})
  const [windowsLoading, setWindowsLoading] = useState(false)
  const [hasPermission, setHasPermission] = useState<
    { mihomo: boolean; 'mihomo-alpha': boolean } | boolean | null
  >(null)
  const isWindows = platform === 'win32'

  const checkPermissions = async (): Promise<void> => {
    try {
      const result = isWindows ? await checkElevateTask() : await checkCorePermission()
      setHasPermission(result)
    } catch {
      setHasPermission(isWindows ? false : { mihomo: false, 'mihomo-alpha': false })
    }
  }

  useEffect(() => {
    checkPermissions()
  }, [])

  const handleCoreAction = async (
    coreName: 'mihomo' | 'mihomo-alpha',
    isGrant: boolean
  ): Promise<void> => {
    setLoading((prev) => ({ ...prev, [coreName]: true }))
    try {
      if (isGrant) {
        await manualGrantCorePermition([coreName])
      } else {
        await revokeCorePermission([coreName])
      }
      await checkPermissions()
    } catch (e) {
      // 忽略用户取消操作的错误
      const errorMsg = String(e)
      if (
        /(?:用户|用戶|使用者)取消操作/.test(errorMsg) ||
        errorMsg.includes('UserCancelledError')
      ) {
        // 静默失败，只刷新状态
        await checkPermissions()
        return
      }
      notify(e, { variant: 'danger' })
    } finally {
      setLoading((prev) => ({ ...prev, [coreName]: false }))
    }
  }

  const handleWindowsAction = async (elevated: boolean): Promise<void> => {
    setWindowsLoading(true)
    try {
      if (elevated) await relaunchWindowsElevated()
      else await relaunchWindowsUnelevated()
    } catch (e) {
      const errorMsg = String(e)
      if (!errorMsg.includes('User canceled')) notify(e, { variant: 'danger' })
      await checkPermissions()
      setWindowsLoading(false)
    }
  }

  const getStatusText = (coreName: 'mihomo' | 'mihomo-alpha'): string => {
    if (hasPermission === null) return tr('Checking')
    if (typeof hasPermission === 'boolean')
      return hasPermission ? tr('Authorized') : tr('Not authorized')
    return hasPermission[coreName] ? tr('Authorized') : tr('Not authorized')
  }

  const getStatusColor = (coreName: 'mihomo' | 'mihomo-alpha'): string => {
    if (hasPermission === null) return 'bg-default-400 animate-pulse'
    if (typeof hasPermission === 'boolean') {
      return hasPermission ? 'bg-success' : 'bg-warning'
    }
    return hasPermission[coreName] ? 'bg-success' : 'bg-warning'
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
              <Modal.Heading>{tr('Manage elevation')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="space-y-4">
                {isWindows ? (
                  <>
                    <Card
                      shadow="sm"
                      className="border-none bg-linear-to-br from-default-50 to-default-100"
                    >
                      <CardBody className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {tr('Administrator status')}
                            </span>
                          </div>
                          <Chip
                            color={
                              typeof hasPermission === 'boolean'
                                ? hasPermission
                                  ? 'success'
                                  : 'warning'
                                : 'default'
                            }
                            variant="flat"
                            size="sm"
                          >
                            {hasPermission === null
                              ? tr('Checking...')
                              : typeof hasPermission === 'boolean'
                                ? hasPermission
                                  ? tr('Administrator')
                                  : tr('Standard user')
                                : tr('Unknown')}
                          </Chip>
                        </div>
                      </CardBody>
                    </Card>

                    <Divider />

                    <div className="text-xs text-default-500 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5">•</span>
                        <span>
                          {tr(
                            'Manual elevation affects only this run and does not create a scheduled task or persistent elevation'
                          )}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5">•</span>
                        <span>
                          {tr(
                            'Cancelling elevation restarts KokoroBox with the current desktop user privileges'
                          )}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-3">
                      <Card shadow="sm" className="border-none">
                        <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-medium">
                                {tr('Built-in release')}
                              </h4>
                            </div>
                            <Chip
                              color={
                                getStatusColor('mihomo') === 'bg-success' ? 'success' : 'warning'
                              }
                              variant="flat"
                              size="sm"
                            >
                              {getStatusText('mihomo')}
                            </Chip>
                          </div>
                        </CardHeader>
                        <CardBody className="pt-3 px-4 pb-4">
                          {typeof hasPermission !== 'boolean' && hasPermission?.mihomo ? (
                            <Button
                              size="sm"
                              color="warning"
                              variant="flat"
                              onPress={() => handleCoreAction('mihomo', false)}
                              isLoading={loading.mihomo}
                              fullWidth
                            >
                              {tr('Revoke authorization')}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              color="primary"
                              variant="shadow"
                              onPress={() => handleCoreAction('mihomo', true)}
                              isLoading={loading.mihomo}
                              fullWidth
                            >
                              {tr('Authorize core')}
                            </Button>
                          )}
                        </CardBody>
                      </Card>

                      <Card shadow="sm" className="border-none">
                        <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-medium">
                                {tr('Built-in preview')}
                              </h4>
                            </div>
                            <Chip
                              color={
                                getStatusColor('mihomo-alpha') === 'bg-success'
                                  ? 'success'
                                  : 'warning'
                              }
                              variant="flat"
                              size="sm"
                            >
                              {getStatusText('mihomo-alpha')}
                            </Chip>
                          </div>
                        </CardHeader>
                        <CardBody className="pt-3 px-4 pb-4">
                          {typeof hasPermission !== 'boolean' && hasPermission?.['mihomo-alpha'] ? (
                            <Button
                              size="sm"
                              color="warning"
                              variant="flat"
                              onPress={() => handleCoreAction('mihomo-alpha', false)}
                              isLoading={loading['mihomo-alpha']}
                              fullWidth
                            >
                              {tr('Revoke authorization')}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              color="primary"
                              variant="shadow"
                              onPress={() => handleCoreAction('mihomo-alpha', true)}
                              isLoading={loading['mihomo-alpha']}
                              fullWidth
                            >
                              {tr('Authorize core')}
                            </Button>
                          )}
                        </CardBody>
                      </Card>
                    </div>

                    <div className="text-xs text-default-500 space-y-2">
                      <div className="flex items-start gap-2">
                        <span>{tr('Grant the core the system permissions it needs')}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span>{tr('Enables advanced network features such as TUN')}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Modal.Body>
            <Modal.Footer className="space-x-2">
              {isWindows && typeof hasPermission === 'boolean' ? (
                <Button
                  size="sm"
                  color={hasPermission ? 'warning' : 'primary'}
                  variant={hasPermission ? 'flat' : 'shadow'}
                  onPress={() => handleWindowsAction(!hasPermission)}
                  isLoading={windowsLoading}
                >
                  {hasPermission ? tr('Restart as standard user') : tr('Restart as administrator')}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="light"
                onPress={() => onChange(false)}
                isDisabled={windowsLoading || Object.values(loading).some((v) => v)}
              >
                {tr('Close')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default PermissionModal
