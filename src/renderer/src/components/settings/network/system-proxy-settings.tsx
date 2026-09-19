import { tr } from '../../../../../shared/i18n'
import { Button, Switch, Tooltip } from '@heroui/react'
import { KokoTextField as Input } from '@renderer/components/base/koko-form'
import { SettingTabs } from '@renderer/components/base/base-controls'
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
import React, { useEffect, useState } from 'react'
import ByPassEditorModal from '@renderer/components/sysproxy/bypass-editor-modal'
import { IoIosHelpCircle } from 'react-icons/io'
import { notify } from '@renderer/utils/notification'
import { useSettingsSave } from '@renderer/hooks/use-settings-save'
import { useUnsavedChangesGuard } from '@renderer/hooks/use-unsaved-changes'

const defaultPacScript = `
function FindProxyForURL(url, host) {
  return "PROXY 127.0.0.1:%mixed-port%; SOCKS5 127.0.0.1:%mixed-port%; DIRECT;";
}
`

interface Props {
  embedded?: boolean
}

const Sysproxy: React.FC<Props> = ({ embedded = false }) => {
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

  const onSave = async (): Promise<boolean> => {
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
    return saved
  }

  useUnsavedChangesGuard({
    id: 'system-proxy-settings',
    label: tr('System proxy settings'),
    isDirty: changed,
    isSaving,
    onSave,
    onDiscard: () => {
      syncValuesFromSysProxy(sysProxy)
      setChanged(false)
    }
  })

  const saveButton = changed ? (
    <FeatureSettingsSaveButton isDirty={changed} isSaving={isSaving} onPress={onSave} />
  ) : null

  const content = (
    <>
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
      <FeatureSettingsLayout action={embedded ? saveButton : undefined}>
        <FeatureSettingsSection title={tr('Proxy configuration')}>
          <SettingItem
            title={tr('Proxy host')}
            description={tr('Leave empty to use 127.0.0.1')}
            divider
          >
            <Input
              size="sm"
              className="w-full max-w-72"
              value={values.host}
              placeholder="127.0.0.1"
              onValueChange={(v) => {
                setValues({ ...values, host: v })
              }}
            />
          </SettingItem>
          <SettingItem title={tr('Proxy mode')} divider={values.mode === 'auto'}>
            <SettingTabs
              ariaLabel={tr('Proxy mode')}
              selectedKey={values.mode}
              options={[
                { id: 'manual', label: tr('Manual') },
                { id: 'auto', label: 'PAC' }
              ]}
              onChange={(key) => setValues({ ...values, mode: key as SysProxyMode })}
            />
          </SettingItem>
          {values.mode === 'auto' && (
            <SettingItem title={tr('PAC script')}>
              <Button size="sm" variant="secondary" onPress={() => setOpenPacEditor(true)}>
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
                variant="secondary"
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
            <SettingTabs
              ariaLabel={tr('Configuration method')}
              selectedKey={values.settingMode}
              options={[
                { id: 'exec', label: tr('Run command') },
                { id: 'service', label: tr('Service mode') }
              ]}
              onChange={(key) => {
                const settingMode = key as 'exec' | 'service'
                setValues({
                  ...values,
                  settingMode,
                  guard: settingMode === 'service' ? values.guard : false,
                  guardNotify: settingMode === 'service' ? values.guardNotify : false
                })
              }}
            />
          </SettingItem>
          {platform === 'linux' && (
            <SettingItem
              title={tr('Terminal proxy')}
              actions={
                <Tooltip delay={0}>
                  <Tooltip.Trigger>
                    <Button isIconOnly size="sm" variant="ghost" aria-label={tr('Description')}>
                      <IoIosHelpCircle className="text-lg" />
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    <div>
                      {tr(
                        'Existing terminals do not update automatically after enabling or disabling this setting. Fully close and reopen the terminal; some desktop environments may require signing in again.'
                      )}
                    </div>
                  </Tooltip.Content>
                </Tooltip>
              }
            >
              <Switch
                size="sm"
                isSelected={values.terminalProxy}
                onChange={(v) => {
                  setValues({ ...values, terminalProxy: v })
                }}
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
          )}
          {platform !== 'linux' && values.settingMode === 'service' && (
            <SettingItem
              title={tr('Active interfaces only')}
              actions={
                <Tooltip delay={0}>
                  <Tooltip.Trigger>
                    <Button isIconOnly size="sm" variant="ghost" aria-label={tr('Description')}>
                      <IoIosHelpCircle className="text-lg" />
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    <>
                      <div>
                        {tr(
                          'Apply the system proxy only to active network interfaces. Requires service mode'
                        )}
                      </div>
                    </>
                  </Tooltip.Content>
                </Tooltip>
              }
            >
              <Switch
                size="sm"
                isSelected={onlyActiveDevice}
                isDisabled={!values.settingMode || values.settingMode !== 'service'}
                onChange={(v) => {
                  patchAppConfig({ onlyActiveDevice: v })
                }}
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
          )}
        </FeatureSettingsSection>

        {(values.settingMode === 'service' || values.mode === 'manual') && (
          <FeatureSettingsSection title={tr('Reliability and exclusions')}>
            {values.settingMode === 'service' && (
              <SettingItem
                title={tr('System proxy watchdog')}
                actions={
                  <Tooltip delay={0}>
                    <Tooltip.Trigger>
                      <Button isIconOnly size="sm" variant="ghost" aria-label={tr('Description')}>
                        <IoIosHelpCircle className="text-lg" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <div>
                        {tr(
                          'Restore the system proxy automatically if it is changed. Requires service mode'
                        )}
                      </div>
                    </Tooltip.Content>
                  </Tooltip>
                }
                divider={values.guard || values.mode === 'manual'}
              >
                <Switch
                  size="sm"
                  isSelected={values.guard}
                  onChange={(v) => {
                    setValues({ ...values, guard: v, guardNotify: v ? values.guardNotify : false })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
            )}
            {values.settingMode === 'service' && values.guard && (
              <SettingItem
                title={tr('Watchdog notifications')}
                actions={
                  <Tooltip delay={0}>
                    <Tooltip.Trigger>
                      <Button isIconOnly size="sm" variant="ghost" aria-label={tr('Description')}>
                        <IoIosHelpCircle className="text-lg" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <div>{tr('Notify when system proxy restoration succeeds or fails')}</div>
                    </Tooltip.Content>
                  </Tooltip>
                }
                divider={values.mode === 'manual'}
              >
                <Switch
                  size="sm"
                  isSelected={values.guardNotify}
                  isDisabled={!values.guard}
                  onChange={(v) => {
                    setValues({ ...values, guardNotify: v })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
            )}
            {values.mode === 'manual' && (
              <>
                <SettingItem title={tr('Add default proxy bypasses')} divider>
                  <Button
                    size="sm"
                    variant="secondary"
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
                <SettingItem title={tr('Proxy bypass list')} align="start">
                  <div className="flex w-full min-w-0 flex-col gap-2">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={async () => {
                          setOpenEditor(true)
                        }}
                      >
                        {tr('Edit')}
                      </Button>
                    </div>
                    <EditableList
                      items={values.bypass}
                      onChange={(list) => setValues({ ...values, bypass: list as string[] })}
                      placeholder={tr('Example: *.baidu.com')}
                      divider={false}
                    />
                  </div>
                </SettingItem>
              </>
            )}
          </FeatureSettingsSection>
        )}
      </FeatureSettingsLayout>
    </>
  )

  if (embedded) return content

  return (
    <BasePage
      title={tr('System proxy settings')}
      contentClassName="no-scrollbar"
      header={saveButton}
    >
      {content}
    </BasePage>
  )
}

export default Sysproxy
