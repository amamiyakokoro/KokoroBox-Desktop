import { tr } from '../../../../shared/i18n'
import React, { useState, useEffect } from 'react'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import { Button, Input, Switch } from '@heroui/react'
import {
  startSubStoreFrontendServer,
  startSubStoreBackendServer,
  stopSubStoreFrontendServer,
  stopSubStoreBackendServer
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import debounce from '@renderer/utils/debounce'
import { isValidCron } from 'cron-validator'
import { notify } from '@renderer/utils/notification'

const SubStoreConfig: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    useSubStore = true,
    useCustomSubStore = false,
    useProxyInSubStore = false,
    subStoreHost = '127.0.0.1',
    customSubStoreUrl,
    subStoreBackendSyncCron,
    subStoreBackendDownloadCron,
    subStoreBackendUploadCron
  } = appConfig || {}

  const [customSubStoreUrlValue, setCustomSubStoreUrlValue] = useState(customSubStoreUrl ?? '')
  const setCustomSubStoreUrl = debounce(async (v: string) => {
    await patchAppConfig({ customSubStoreUrl: v })
  }, 500)
  const [subStoreBackendSyncCronValue, setSubStoreBackendSyncCronValue] = useState(
    subStoreBackendSyncCron ?? ''
  )
  const [subStoreBackendDownloadCronValue, setSubStoreBackendDownloadCronValue] = useState(
    subStoreBackendDownloadCron ?? ''
  )
  const [subStoreBackendUploadCronValue, setSubStoreBackendUploadCronValue] = useState(
    subStoreBackendUploadCron ?? ''
  )

  useEffect(() => {
    setCustomSubStoreUrlValue(customSubStoreUrl ?? '')
  }, [customSubStoreUrl])

  useEffect(() => {
    setSubStoreBackendSyncCronValue(subStoreBackendSyncCron ?? '')
  }, [subStoreBackendSyncCron])

  useEffect(() => {
    setSubStoreBackendDownloadCronValue(subStoreBackendDownloadCron ?? '')
  }, [subStoreBackendDownloadCron])

  useEffect(() => {
    setSubStoreBackendUploadCronValue(subStoreBackendUploadCron ?? '')
  }, [subStoreBackendUploadCron])

  return (
    <SettingCard header={tr('Sub-Store 设置')}>
      <SettingItem compatKey="legacy" title={tr('启用 Sub-Store')} divider={useSubStore}>
        <Switch
          size="sm"
          isSelected={useSubStore}
          onValueChange={async (v) => {
            try {
              await patchAppConfig({ useSubStore: v })
              if (v) {
                await startSubStoreFrontendServer()
                await startSubStoreBackendServer()
              } else {
                await stopSubStoreFrontendServer()
                await stopSubStoreBackendServer()
              }
            } catch (e) {
              notify(e, { variant: 'danger' })
            }
          }}
        />
      </SettingItem>
      {useSubStore && (
        <>
          <SettingItem compatKey="legacy" title={tr('允许局域网连接')} divider>
            <Switch
              size="sm"
              isSelected={subStoreHost === '0.0.0.0'}
              onValueChange={async (v) => {
                try {
                  if (v) {
                    await patchAppConfig({ subStoreHost: '0.0.0.0' })
                  } else {
                    await patchAppConfig({ subStoreHost: '127.0.0.1' })
                  }
                  await startSubStoreFrontendServer()
                  await startSubStoreBackendServer()
                } catch (e) {
                  notify(e, { variant: 'danger' })
                }
              }}
            />
          </SettingItem>
          <SettingItem compatKey="legacy" title={tr('使用自建 Sub-Store 后端')} divider>
            <Switch
              size="sm"
              isSelected={useCustomSubStore}
              onValueChange={async (v) => {
                try {
                  await patchAppConfig({ useCustomSubStore: v })
                  if (v) {
                    await stopSubStoreBackendServer()
                  } else {
                    await startSubStoreBackendServer()
                  }
                } catch (e) {
                  notify(e, { variant: 'danger' })
                }
              }}
            />
          </SettingItem>
          {useCustomSubStore ? (
            <SettingItem compatKey="legacy" title={tr('自建 Sub-Store 后端地址')}>
              <Input
                size="sm"
                className="w-[60%]"
                value={customSubStoreUrlValue}
                placeholder={tr('必须包含协议头')}
                onValueChange={(v: string) => {
                  setCustomSubStoreUrlValue(v)
                  setCustomSubStoreUrl(v)
                }}
              />
            </SettingItem>
          ) : (
            <>
              <SettingItem compatKey="legacy" title={tr('为 Sub-Store 内所有请求启用代理')} divider>
                <Switch
                  size="sm"
                  isSelected={useProxyInSubStore}
                  onValueChange={async (v) => {
                    try {
                      await patchAppConfig({ useProxyInSubStore: v })
                      await startSubStoreBackendServer()
                    } catch (e) {
                      notify(e, { variant: 'danger' })
                    }
                  }}
                />
              </SettingItem>
              <SettingItem compatKey="legacy" title={tr('定时同步订阅/文件')} divider>
                <div className="flex w-[60%] gap-2">
                  {subStoreBackendSyncCronValue !== subStoreBackendSyncCron && (
                    <Button
                      size="sm"
                      color="primary"
                      onPress={async () => {
                        if (
                          !subStoreBackendSyncCronValue ||
                          isValidCron(subStoreBackendSyncCronValue)
                        ) {
                          await patchAppConfig({
                            subStoreBackendSyncCron: subStoreBackendSyncCronValue
                          })
                          notify(tr('重启应用生效'))
                        } else {
                          notify(tr('Cron 表达式无效'), { variant: 'danger' })
                        }
                      }}
                    >
                      {tr('确认')}
                    </Button>
                  )}
                  <Input
                    size="sm"
                    value={subStoreBackendSyncCronValue}
                    placeholder={tr('Cron 表达式')}
                    onValueChange={(v: string) => {
                      setSubStoreBackendSyncCronValue(v)
                    }}
                  />
                </div>
              </SettingItem>
              <SettingItem compatKey="legacy" title={tr('定时恢复配置')} divider>
                <div className="flex w-[60%] gap-2">
                  {subStoreBackendDownloadCronValue !== subStoreBackendDownloadCron && (
                    <Button
                      size="sm"
                      color="primary"
                      onPress={async () => {
                        if (
                          !subStoreBackendDownloadCronValue ||
                          isValidCron(subStoreBackendDownloadCronValue)
                        ) {
                          await patchAppConfig({
                            subStoreBackendDownloadCron: subStoreBackendDownloadCronValue
                          })
                          notify(tr('重启应用生效'))
                        } else {
                          notify(tr('Cron 表达式无效'), { variant: 'danger' })
                        }
                      }}
                    >
                      {tr('确认')}
                    </Button>
                  )}
                  <Input
                    size="sm"
                    value={subStoreBackendDownloadCronValue}
                    placeholder={tr('Cron 表达式')}
                    onValueChange={(v: string) => {
                      setSubStoreBackendDownloadCronValue(v)
                    }}
                  />
                </div>
              </SettingItem>
              <SettingItem compatKey="legacy" title={tr('定时备份配置')}>
                <div className="flex w-[60%] gap-2">
                  {subStoreBackendUploadCronValue !== subStoreBackendUploadCron && (
                    <Button
                      size="sm"
                      color="primary"
                      onPress={async () => {
                        if (
                          !subStoreBackendUploadCronValue ||
                          isValidCron(subStoreBackendUploadCronValue)
                        ) {
                          await patchAppConfig({
                            subStoreBackendUploadCron: subStoreBackendUploadCronValue
                          })
                          notify(tr('重启应用生效'))
                        } else {
                          notify(tr('Cron 表达式无效'), { variant: 'danger' })
                        }
                      }}
                    >
                      {tr('确认')}
                    </Button>
                  )}
                  <Input
                    size="sm"
                    value={subStoreBackendUploadCronValue}
                    placeholder={tr('Cron 表达式')}
                    onValueChange={(v: string) => {
                      setSubStoreBackendUploadCronValue(v)
                    }}
                  />
                </div>
              </SettingItem>
            </>
          )}
        </>
      )}
    </SettingCard>
  )
}

export default SubStoreConfig
