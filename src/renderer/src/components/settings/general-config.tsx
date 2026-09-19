import { tr } from '../../../../shared/i18n'
import React, { useState } from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import {
  KokoButton as Button,
  KokoSelect,
  KokoSwitch as Switch,
  KokoTooltip as Tooltip
} from '../base/koko-form'
import useSWR from 'swr'
import {
  checkAutoRun,
  disableAutoRun,
  enableAutoRun,
  openAutoRunSystemSettings,
  relaunchApp
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { IoIosHelpCircle } from 'react-icons/io'
import ConfirmModal from '../base/base-confirm'
import { notify } from '@renderer/utils/notification'
import { SettingTabs } from '../base/base-controls'

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
        <SettingItem compatKey="legacy" title={tr('Interface language')} divider>
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
            <KokoSelect
              aria-label={tr('Interface language')}
              variant="secondary"
              className="w-44"
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
              <Button size="sm" color="primary" onPress={() => relaunchApp()}>
                {tr('Restart to apply language')}
              </Button>
            )}
          </div>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('Notification style')}>
          <SettingTabs
            ariaLabel={tr('Notification style')}
            selectedKey={notificationMode}
            options={[
              { id: 'system', label: tr('System') },
              { id: 'toast', label: tr('In-app') }
            ]}
            onChange={(key) => {
              patchAppConfig({ notificationMode: key as AppNotificationMode })
            }}
          />
        </SettingItem>
      </SettingCard>

      <SettingCard header={tr('Startup and updates')}>
        <SettingItem compatKey="legacy" title={tr('Launch at startup')} divider>
          <div className="flex items-center gap-2">
            {autoRunStatus?.requiresApproval && (
              <Tooltip
                content={tr(
                  'Allow KokoroBox in System Settings → General → Login Items & Extensions.'
                )}
              >
                <Button
                  size="sm"
                  color="warning"
                  variant="flat"
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
              </Tooltip>
            )}
            <Switch
              size="sm"
              isSelected={autoRunStatus?.enabled ?? false}
              onValueChange={async (v) => {
                try {
                  const status = v ? await enableAutoRun() : await disableAutoRun()
                  await mutateAutoRunStatus(status, { revalidate: false })
                } catch (e) {
                  notify(e, { variant: 'danger' })
                  await mutateAutoRunStatus()
                }
              }}
            />
          </div>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('Start minimized')} divider>
          <Switch
            size="sm"
            isSelected={silentStart}
            onValueChange={(v) => {
              patchAppConfig({ silentStart: v })
            }}
          />
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('Check for updates automatically')} divider>
          <Switch
            size="sm"
            isSelected={autoCheckUpdate}
            onValueChange={(v) => {
              patchAppConfig({ autoCheckUpdate: v })
            }}
          />
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('Update channel')}>
          <SettingTabs
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
          compatKey="legacy"
          title={tr('Disable GPU acceleration')}
          actions={
            <Tooltip
              content={tr(
                'Disable GPU acceleration. This may improve stability but reduce performance'
              )}
            >
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Switch
            size="sm"
            isSelected={pendingDisableGPU}
            onValueChange={(v) => {
              setPendingDisableGPU(v)
              setShowRestartConfirm(true)
            }}
          />
        </SettingItem>
        <SettingItem
          compatKey="legacy"
          title={tr('Reduce animations')}
          actions={
            <Tooltip content={tr('Reduce most animations, which may improve performance')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
        >
          <Switch
            size="sm"
            isSelected={disableAnimation}
            onValueChange={(v) => {
              patchAppConfig({ disableAnimation: v })
            }}
          />
        </SettingItem>
      </SettingCard>
    </>
  )
}

export default GeneralConfig
