import { tr } from '../../../../shared/i18n'
import React, { useState } from 'react'
import { Switch } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { restartCore } from '@renderer/utils/ipc'
import EditableList from '../base/base-list-editor'
import { platform } from '@renderer/utils/init'
import { notify } from '@renderer/utils/notification'
import PubSub from 'pubsub-js'
import PendingFieldAction from '../base/base-pending-field-action'

const EnvSetting: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    disableLoopbackDetector,
    disableEmbedCA,
    disableSystemCA,
    disableNftables,
    safePaths = []
  } = appConfig || {}
  const handleConfigChangeWithRestart = async (key: string, value: unknown): Promise<void> => {
    try {
      if (!(await patchAppConfig({ [key]: value }))) return
      await restartCore()
      PubSub.publish('mihomo-core-changed')
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }
  const [safePathsInput, setSafePathsInput] = useState(safePaths)

  return (
    <SettingCard>
      <SettingItem contentAlign="end" title={tr('Disable system CAs')} divider>
        <Switch
          size="sm"
          isSelected={disableSystemCA}
          onChange={(v) => {
            handleConfigChangeWithRestart('disableSystemCA', v)
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </SettingItem>
      <SettingItem contentAlign="end" title={tr('Disable built-in CAs')} divider>
        <Switch
          size="sm"
          isSelected={disableEmbedCA}
          onChange={(v) => {
            handleConfigChangeWithRestart('disableEmbedCA', v)
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </SettingItem>
      <SettingItem contentAlign="end" title={tr('Disable loopback detection')} divider>
        <Switch
          size="sm"
          isSelected={disableLoopbackDetector}
          onChange={(v) => {
            handleConfigChangeWithRestart('disableLoopbackDetector', v)
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </SettingItem>
      {platform == 'linux' && (
        <SettingItem contentAlign="end" title={tr('Disable nftables')} divider>
          <Switch
            size="sm"
            isSelected={disableNftables}
            onChange={(v) => {
              handleConfigChangeWithRestart('disableNftables', v)
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
      <SettingItem contentAlign="end" title={tr('Trusted path')}>
        <PendingFieldAction
          isVisible={safePathsInput.join('') != safePaths.join('')}
          onPress={() => handleConfigChangeWithRestart('safePaths', safePathsInput)}
        />
      </SettingItem>
      <EditableList
        items={safePathsInput}
        onChange={(items) => setSafePathsInput(items as string[])}
        divider={false}
      />{' '}
    </SettingCard>
  )
}

export default EnvSetting
