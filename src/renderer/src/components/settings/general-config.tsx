import { tr } from '../../../../shared/i18n'
import React, { useState } from 'react'
import { Button, Switch, Tooltip } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { KokoSelect } from '../base/koko-form'
import useSWR from 'swr'
import {
  checkAutoRun,
  disableAutoRun,
  enableAutoRun,
  openAutoRunSystemSettings,
  relaunchApp
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import ConfirmModal from '../base/base-confirm'
import { notify } from '@renderer/utils/notification'
import { KokoSegmentedControl } from '../base/base-controls'
import { LuAppWindow, LuBell } from 'react-icons/lu'

const GeneralConfig: React.FC = () => {
  const { data: autoRunStatus, mutate: mutateAutoRunStatus } = useSWR('checkAutoRun', checkAutoRun)
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    language = 'system',
    silentStart = false,
    autoCheckUpdate,
    updateChannel = 'stable',
    notificationMode = 'system'
  } = appConfig || {}

  const [languageChanged, setLanguageChanged] = useState(false)

  return (
    <>
      <SettingCard header={tr('Language and notifications')}>
        <SettingItem contentAlign="end" title={tr('Interface language')} divider>
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
            <KokoSelect
              aria-label={tr('Interface language')}
              variant="secondary"
              controlWidth="select"
              value={language}
              options={[
                { id: 'system', label: tr('System default') },
                { id: 'zh-CN', label: '简体中文' },
                { id: 'zh-TW', label: '繁體中文' },
                { id: 'en', label: 'English' }
              ]}
              disallowEmptySelection
              onChange={async (nextLanguage) => {
                if (!['system', 'zh-CN', 'zh-TW', 'en'].includes(nextLanguage || '')) return
                const saved = await patchAppConfig({ language: nextLanguage as AppLanguage })
                if (saved) setLanguageChanged(true)
              }}
            />
            {languageChanged && (
              <Button size="sm" variant="primary" onPress={() => relaunchApp()}>
                {tr('Restart to apply language')}
              </Button>
            )}
          </div>
        </SettingItem>
        <SettingItem contentAlign="end" title={tr('Notification style')}>
          <KokoSegmentedControl
            ariaLabel={tr('Notification style')}
            selectedKey={notificationMode}
            options={[
              { id: 'system', label: tr('System'), icon: <LuBell aria-hidden="true" /> },
              { id: 'toast', label: tr('In-app'), icon: <LuAppWindow aria-hidden="true" /> }
            ]}
            onChange={(key) => {
              patchAppConfig({ notificationMode: key as AppNotificationMode })
            }}
          />
        </SettingItem>
      </SettingCard>

      <SettingCard header={tr('Startup and updates')}>
        <SettingItem contentAlign="end" title={tr('Launch at startup')} divider>
          <div className="flex items-center gap-2">
            {autoRunStatus?.requiresApproval && (
              <Tooltip delay={0}>
                <Tooltip.Trigger>
                  <Button
                    size="sm"
                    className="text-warning-700 dark:text-warning-400"
                    variant="secondary"
                    onPress={async () => {
                      try {
                        await openAutoRunSystemSettings()
                      } catch (e) {
                        notify(e, { variant: 'danger' })
                      }
                    }}
                  >
                    {tr('Awaiting system approval')}
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {tr('Allow KokoroBox in System Settings → General → Login Items & Extensions.')}
                </Tooltip.Content>
              </Tooltip>
            )}
            <Switch
              size="sm"
              isSelected={autoRunStatus?.enabled ?? false}
              onChange={async (v) => {
                try {
                  const status = v ? await enableAutoRun() : await disableAutoRun()
                  await mutateAutoRunStatus(status, { revalidate: false })
                } catch (e) {
                  notify(e, { variant: 'danger' })
                  await mutateAutoRunStatus()
                }
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>
        </SettingItem>
        <SettingItem contentAlign="end" title={tr('Start minimized')} divider>
          <Switch
            size="sm"
            isSelected={silentStart}
            onChange={(v) => {
              patchAppConfig({ silentStart: v })
            }}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <SettingItem contentAlign="end" title={tr('Check for updates automatically')} divider>
          <Switch
            size="sm"
            isSelected={autoCheckUpdate}
            onChange={(v) => {
              patchAppConfig({ autoCheckUpdate: v })
            }}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <SettingItem
          contentAlign="end"
          title={tr('Update channel')}
          help={tr(
            'Stable receives tested releases. Rolling receives newer builds more frequently.'
          )}
        >
          <KokoSegmentedControl
            ariaLabel={tr('Update channel')}
            selectedKey={updateChannel}
            options={[
              { id: 'stable', label: tr('Stable') },
              { id: 'rolling', label: tr('Rolling') }
            ]}
            onChange={(key) => {
              patchAppConfig({ updateChannel: key as AppUpdateChannel })
            }}
          />
        </SettingItem>
      </SettingCard>
    </>
  )
}

export const PerformanceConfig: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const { disableGPU = false, disableAnimation = false } = appConfig || {}
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [pendingDisableGPU, setPendingDisableGPU] = useState(disableGPU)

  return (
    <>
      {showRestartConfirm && (
        <ConfirmModal
          title={tr('Restart the app?')}
          description={
            <div>
              <p>{tr('Restart the app to apply GPU acceleration changes')}</p>
            </div>
          }
          confirmText={tr('Restart')}
          cancelText={tr('Cancel')}
          onChange={(open) => {
            if (!open) {
              setPendingDisableGPU(disableGPU)
            }
            setShowRestartConfirm(open)
          }}
          onConfirm={async () => {
            await patchAppConfig({ disableGPU: pendingDisableGPU })
            if (!pendingDisableGPU) {
              await patchAppConfig({ disableAnimation: false })
            }
            await relaunchApp()
          }}
        />
      )}
      <SettingCard header={tr('Performance')}>
        <SettingItem
          contentAlign="end"
          title={tr('Disable GPU acceleration')}
          help={tr('Disable GPU acceleration. This may improve stability but reduce performance')}
          divider
        >
          <Switch
            size="sm"
            isSelected={pendingDisableGPU}
            onChange={(v) => {
              setPendingDisableGPU(v)
              setShowRestartConfirm(true)
            }}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <SettingItem
          contentAlign="end"
          title={tr('Reduce animations')}
          help={tr('Reduce most animations, which may improve performance')}
        >
          <Switch
            size="sm"
            isSelected={disableAnimation}
            onChange={(v) => {
              patchAppConfig({ disableAnimation: v })
            }}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
      </SettingCard>
    </>
  )
}

export default GeneralConfig
