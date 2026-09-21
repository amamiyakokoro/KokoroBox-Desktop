import { tr } from '../../../../../shared/i18n'
import { Button, Switch } from '@heroui/react'
import { KokoTextField } from '@renderer/components/base/koko-form'
import { KokoSegmentedControl } from '@renderer/components/base/base-controls'
import BasePage from '@renderer/components/base/base-page'
import SettingItem from '@renderer/components/base/base-setting-item'
import SettingSubgroup from '@renderer/components/base/base-setting-subgroup'
import FeatureSettingsLayout, {
  FeatureSettingsSaveButton,
  FeatureSettingsSection
} from '@renderer/components/base/base-feature-settings'
import PacEditorModal from '@renderer/components/sysproxy/pac-editor-modal'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import { getAppConfig, openUWPTool, serviceStatus, triggerSysProxy } from '@renderer/utils/ipc'
import React, { useEffect, useState } from 'react'
import ByPassEditorModal from '@renderer/components/sysproxy/bypass-editor-modal'
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

const bypassPreviewLimit = 5

const BypassListPreview: React.FC<{ items: string[] }> = ({ items }) => {
  const previewItems = items.slice(0, bypassPreviewLimit)
  const remaining = Math.max(0, items.length - previewItems.length)

  return (
    <div
      className="overflow-hidden rounded-xl border border-separator/80 bg-surface-secondary/40"
      data-bypass-preview
    >
      {previewItems.length > 0 ? (
        <ul aria-label={tr('Proxy bypass list')} className="divide-y divide-separator/60">
          {previewItems.map((item, index) => (
            <li key={`${item}-${index}`} className="min-w-0 px-3 py-1">
              <code
                className="block min-w-0 truncate font-mono text-xs leading-5 text-muted"
                title={item}
              >
                {item}
              </code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-2 text-xs leading-5 text-muted">{tr('No bypass entries')}</p>
      )}
      {remaining > 0 && (
        <p className="border-t border-separator/60 px-3 py-1.5 text-xs leading-4 text-muted">
          {tr('+ {0} more', [remaining])}
        </p>
      )}
    </div>
  )
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
      <FeatureSettingsLayout>
        <FeatureSettingsSection
          title={tr('Proxy configuration')}
          action={embedded ? saveButton : undefined}
        >
          <SettingItem
            title={tr('Proxy host')}
            description={tr('Leave empty to use 127.0.0.1')}
            divider
          >
            <KokoTextField
              controlWidth="short"
              value={values.host}
              placeholder="127.0.0.1"
              onChangeValue={(v) => {
                setValues({ ...values, host: v })
              }}
            />
          </SettingItem>
          <SettingItem
            title={tr('Proxy mode')}
            help={tr(
              'Manual configures a fixed proxy endpoint. PAC uses a script to decide which requests use the proxy.'
            )}
            divider={values.mode !== 'auto'}
          >
            <KokoSegmentedControl
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
            <SettingSubgroup label={tr('Proxy mode')}>
              <SettingItem title={tr('PAC script')}>
                <Button size="sm" variant="secondary" onPress={() => setOpenPacEditor(true)}>
                  {tr('Edit')}
                </Button>
              </SettingItem>
            </SettingSubgroup>
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
            help={tr(
              'Run command applies proxy settings directly. Service mode uses KokoroBox Service for privileged and persistent changes.'
            )}
            divider={platform === 'linux'}
          >
            <KokoSegmentedControl
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
              help={tr(
                'Existing terminals do not update automatically after enabling or disabling this setting. Fully close and reopen the terminal; some desktop environments may require signing in again.'
              )}
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
            <SettingSubgroup label={tr('Configuration method')}>
              <SettingItem
                title={tr('Active interfaces only')}
                help={tr(
                  'Apply the system proxy only to active network interfaces. Requires service mode'
                )}
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
            </SettingSubgroup>
          )}
        </FeatureSettingsSection>

        {(values.settingMode === 'service' || values.mode === 'manual') && (
          <FeatureSettingsSection title={tr('Reliability and exclusions')}>
            {values.settingMode === 'service' && (
              <SettingItem
                title={tr('System proxy watchdog')}
                help={tr(
                  'Restore the system proxy automatically if it is changed. Requires service mode'
                )}
                divider={!values.guard && values.mode === 'manual'}
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
              <SettingSubgroup label={tr('System proxy watchdog')}>
                <SettingItem
                  title={tr('Watchdog notifications')}
                  help={tr('Notify when system proxy restoration succeeds or fails')}
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
              </SettingSubgroup>
            )}
            {values.mode === 'manual' && (
              <SettingItem title={tr('Proxy bypass list')} align="start">
                <div className="flex w-full min-w-0 flex-col gap-2">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <span className="text-xs leading-5 text-muted tabular-nums">
                      {tr('{0} items', [values.bypass.length])}
                    </span>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => {
                          setValues({
                            ...values,
                            bypass: Array.from(new Set([...defaultBypass, ...values.bypass]))
                          })
                        }}
                      >
                        {tr('Add defaults')}
                      </Button>
                      <Button size="sm" variant="secondary" onPress={() => setOpenEditor(true)}>
                        {tr('Edit')}
                      </Button>
                    </div>
                  </div>
                  <BypassListPreview items={values.bypass} />
                </div>
              </SettingItem>
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
