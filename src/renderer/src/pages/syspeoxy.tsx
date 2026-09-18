import { tr } from '../../../shared/i18n'
import { Button, Input, Switch, Tab, Tabs, Tooltip } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import SettingItem from '@renderer/components/base/base-setting-item'
import FeatureSettingsLayout, {
  FeatureSettingsSaveButton,
  FeatureSettingsSection
} from '@renderer/components/base/base-feature-settings'
import EditableList from '@renderer/components/base/base-list-editor'
import PacEditorModal from '@renderer/components/sysproxy/pac-editor-modal'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import { getAppConfig, openUWPTool, serviceStatus, triggerSysProxy } from '@renderer/utils/ipc'
import React, { Key, useEffect, useState } from 'react'
import ByPassEditorModal from '@renderer/components/sysproxy/bypass-editor-modal'
import { IoIosHelpCircle } from 'react-icons/io'
import { notify } from '@renderer/utils/notification'
import { useSettingsSave } from '@renderer/hooks/use-settings-save'

const defaultPacScript = `
function FindProxyForURL(url, host) {
  return "PROXY 127.0.0.1:%mixed-port%; SOCKS5 127.0.0.1:%mixed-port%; DIRECT;";
}
`

const Sysproxy: React.FC = () => {
  const defaultBypass: string[] =
    platform === 'linux'
      ? [
          'localhost',
          '.local',
          '127.0.0.1/8',
          '192.168.0.0/16',
          '10.0.0.0/8',
          '172.16.0.0/12',
          '::1'
        ]
      : platform === 'darwin'
        ? [
            '127.0.0.1/8',
            '192.168.0.0/16',
            '10.0.0.0/8',
            '172.16.0.0/12',
            'localhost',
            '*.local',
            '*.crashlytics.com',
            '<local>'
          ]
        : [
            'localhost',
            '127.*',
            '192.168.*',
            '10.*',
            '172.16.*',
            '172.17.*',
            '172.18.*',
            '172.19.*',
            '172.20.*',
            '172.21.*',
            '172.22.*',
            '172.23.*',
            '172.24.*',
            '172.25.*',
            '172.26.*',
            '172.27.*',
            '172.28.*',
            '172.29.*',
            '172.30.*',
            '172.31.*',
            '<local>'
          ]

  const { appConfig, patchAppConfig, mutateAppConfig } = useAppConfig()
  const { sysProxy, onlyActiveDevice = false } =
    appConfig || ({ sysProxy: { enable: false } } as AppConfig)
  const [changed, setChanged] = useState(false)
  const { isSaving, runSave } = useSettingsSave()
  const [values, originSetValues] = useState({
    enable: sysProxy.enable,
    host: sysProxy.host ?? '',
    bypass: sysProxy.bypass ?? defaultBypass,
    mode: sysProxy.mode ?? 'manual',
    pacScript: sysProxy.pacScript ?? defaultPacScript,
    settingMode: sysProxy.settingMode ?? 'exec',
    terminalProxy: sysProxy.terminalProxy ?? false,
    guard: sysProxy.guard ?? false,
    guardNotify: sysProxy.guardNotify ?? false
  })
  const syncValuesFromSysProxy = (nextSysProxy: AppConfig['sysProxy']): void => {
    originSetValues((prev) => ({
      ...prev,
      enable: nextSysProxy.enable,
      host: nextSysProxy.host ?? '',
      bypass: nextSysProxy.bypass ?? defaultBypass,
      mode: nextSysProxy.mode ?? 'manual',
      pacScript: nextSysProxy.pacScript ?? defaultPacScript,
      settingMode: nextSysProxy.settingMode ?? 'exec',
      terminalProxy: nextSysProxy.terminalProxy ?? false,
      guard: nextSysProxy.guard ?? false,
      guardNotify: nextSysProxy.guardNotify ?? false
    }))
  }
  useEffect(() => {
    syncValuesFromSysProxy(sysProxy)
  }, [sysProxy])
  const [openEditor, setOpenEditor] = useState(false)
  const [openPacEditor, setOpenPacEditor] = useState(false)

  const setValues = (v: typeof values): void => {
    originSetValues(v)
    setChanged(true)
  }

  const normalizeServiceModeValues = async (): Promise<typeof values> => {
    if (values.settingMode !== 'service') {
      return values
    }

    const status = await serviceStatus().catch(() => 'unknown' as const)
    if (status === 'running') {
      return values
    }

    notify(tr('Service unavailable. Switched to command execution mode'))
    const nextValues = {
      ...values,
      settingMode: 'exec' as const,
      guard: false,
      guardNotify: false
    }
    originSetValues(nextValues)
    return nextValues
  }

  const onSave = async (): Promise<void> => {
    const saved = await runSave(async () => {
      // check valid TODO
      const nextValues = await normalizeServiceModeValues()
      let nextConfig =
        (await patchAppConfig({ sysProxy: nextValues })) ?? (await getAppConfig(true))
      if (nextConfig.sysProxy.enable) {
        try {
          await triggerSysProxy(nextConfig.sysProxy.enable, onlyActiveDevice)
        } catch (e) {
          notify(e, { variant: 'danger' })
          nextConfig =
            (await patchAppConfig({ sysProxy: { enable: false } })) ?? (await getAppConfig(true))
        }
      }
      syncValuesFromSysProxy(nextConfig.sysProxy)
      await mutateAppConfig()
    })
    if (saved) setChanged(false)
  }

  return (
    <BasePage
      title={tr('System proxy settings')}
      contentClassName="no-scrollbar"
      header={<FeatureSettingsSaveButton isDirty={changed} isSaving={isSaving} onPress={onSave} />}
    >
      {openPacEditor && (
        <PacEditorModal
          script={values.pacScript || defaultPacScript}
          onCancel={() => setOpenPacEditor(false)}
          onConfirm={(script: string) => {
            setValues({ ...values, pacScript: script })
            setOpenPacEditor(false)
          }}
        />
      )}
      {openEditor && (
        <ByPassEditorModal
          bypass={values.bypass}
          onCancel={() => setOpenEditor(false)}
          onConfirm={async (list: string[]) => {
            setOpenEditor(false)
            setValues({
              ...values,
              bypass: list
            })
          }}
        />
      )}
      <FeatureSettingsLayout>
        <FeatureSettingsSection title={tr('Proxy configuration')}>
          <SettingItem title={tr('Proxy host')} divider>
            <Input
              size="sm"
              className="w-[50%]"
              value={values.host}
              placeholder={tr('Default: 127.0.0.1. Change only if needed')}
              onValueChange={(v) => {
                setValues({ ...values, host: v })
              }}
            />
          </SettingItem>
          <SettingItem title={tr('Proxy mode')} divider={values.mode === 'auto'}>
            <Tabs
              size="sm"
              color="primary"
              selectedKey={values.mode}
              onSelectionChange={(key: Key) => setValues({ ...values, mode: key as SysProxyMode })}
            >
              <Tab key="manual" title={tr('Manual')} />
              <Tab key="auto" title="PAC" />
            </Tabs>
          </SettingItem>
          {values.mode === 'auto' && (
            <SettingItem title={tr('PAC script')}>
              <Button size="sm" onPress={() => setOpenPacEditor(true)}>
                {tr('Edit')}
              </Button>
            </SettingItem>
          )}
        </FeatureSettingsSection>

        <FeatureSettingsSection title={tr('System integration')}>
          {platform === 'win32' && (
            <SettingItem title={tr('UWP tool')} divider>
              <Button
                size="sm"
                onPress={async () => {
                  await openUWPTool()
                }}
              >
                {tr('Open UWP tool')}
              </Button>
            </SettingItem>
          )}
          <SettingItem
            title={tr('Configuration method')}
            divider={platform === 'linux' || values.settingMode === 'service'}
          >
            <Tabs
              size="sm"
              color="primary"
              selectedKey={values.settingMode}
              onSelectionChange={(key) => {
                const settingMode = key as 'exec' | 'service'
                setValues({
                  ...values,
                  settingMode,
                  guard: settingMode === 'service' ? values.guard : false,
                  guardNotify: settingMode === 'service' ? values.guardNotify : false
                })
              }}
            >
              <Tab key="exec" title={tr('Run command')} />
              <Tab key="service" title={tr('Service mode')} />
            </Tabs>
          </SettingItem>
          {platform === 'linux' && (
            <SettingItem
              title={tr('Terminal proxy')}
              actions={
                <Tooltip
                  content={
                    <div>
                      {tr(
                        'Existing terminals do not update automatically after enabling or disabling this setting. Fully close and reopen the terminal; some desktop environments may require signing in again.'
                      )}
                    </div>
                  }
                >
                  <Button isIconOnly size="sm" variant="light">
                    <IoIosHelpCircle className="text-lg" />
                  </Button>
                </Tooltip>
              }
            >
              <Switch
                size="sm"
                isSelected={values.terminalProxy}
                onValueChange={(v) => {
                  setValues({ ...values, terminalProxy: v })
                }}
              />
            </SettingItem>
          )}
          {platform !== 'linux' && values.settingMode === 'service' && (
            <SettingItem
              title={tr('Active interfaces only')}
              actions={
                <Tooltip
                  content={
                    <>
                      <div>
                        {tr(
                          'Apply the system proxy only to active network interfaces. Requires service mode'
                        )}
                      </div>
                    </>
                  }
                >
                  <Button isIconOnly size="sm" variant="light">
                    <IoIosHelpCircle className="text-lg" />
                  </Button>
                </Tooltip>
              }
            >
              <Switch
                size="sm"
                isSelected={onlyActiveDevice}
                isDisabled={!values.settingMode || values.settingMode !== 'service'}
                onValueChange={(v) => {
                  patchAppConfig({ onlyActiveDevice: v })
                }}
              />
            </SettingItem>
          )}
        </FeatureSettingsSection>

        {(values.settingMode === 'service' || values.mode === 'manual') && (
          <FeatureSettingsSection title={tr('Reliability and exclusions')}>
            {values.settingMode === 'service' && (
              <SettingItem
                title={tr('System proxy watchdog')}
                actions={
                  <Tooltip
                    content={
                      <div>
                        {tr(
                          'Restore the system proxy automatically if it is changed. Requires service mode'
                        )}
                      </div>
                    }
                  >
                    <Button isIconOnly size="sm" variant="light">
                      <IoIosHelpCircle className="text-lg" />
                    </Button>
                  </Tooltip>
                }
                divider={values.guard || values.mode === 'manual'}
              >
                <Switch
                  size="sm"
                  isSelected={values.guard}
                  onValueChange={(v) => {
                    setValues({ ...values, guard: v, guardNotify: v ? values.guardNotify : false })
                  }}
                />
              </SettingItem>
            )}
            {values.settingMode === 'service' && values.guard && (
              <SettingItem
                title={tr('Watchdog notifications')}
                actions={
                  <Tooltip
                    content={
                      <div>{tr('Notify when system proxy restoration succeeds or fails')}</div>
                    }
                  >
                    <Button isIconOnly size="sm" variant="light">
                      <IoIosHelpCircle className="text-lg" />
                    </Button>
                  </Tooltip>
                }
                divider={values.mode === 'manual'}
              >
                <Switch
                  size="sm"
                  isSelected={values.guardNotify}
                  isDisabled={!values.guard}
                  onValueChange={(v) => {
                    setValues({ ...values, guardNotify: v })
                  }}
                />
              </SettingItem>
            )}
            {values.mode === 'manual' && (
              <>
                <SettingItem title={tr('Add default proxy bypasses')} divider>
                  <Button
                    size="sm"
                    onPress={() => {
                      setValues({
                        ...values,
                        bypass: Array.from(new Set([...defaultBypass, ...values.bypass]))
                      })
                    }}
                  >
                    {tr('Add default proxy bypasses')}
                  </Button>
                </SettingItem>
                <SettingItem title={tr('Proxy bypass list')}>
                  <Button
                    size="sm"
                    onPress={async () => {
                      setOpenEditor(true)
                    }}
                  >
                    {tr('Edit')}
                  </Button>
                </SettingItem>
                <EditableList
                  items={values.bypass}
                  onChange={(list) => setValues({ ...values, bypass: list as string[] })}
                  placeholder={tr('Example: *.baidu.com')}
                  divider={false}
                />
              </>
            )}
          </FeatureSettingsSection>
        )}
      </FeatureSettingsLayout>
    </BasePage>
  )
}

export default Sysproxy
