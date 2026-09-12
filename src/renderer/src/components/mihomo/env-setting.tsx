import { tr } from '../../../../shared/i18n'
import React, { useState } from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Button, Switch } from '@heroui/react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { restartCore } from '@renderer/utils/ipc'
import EditableList from '../base/base-list-editor'
import { platform } from '@renderer/utils/init'
import { notify } from '@renderer/utils/notification'
import PubSub from 'pubsub-js'

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
      await patchAppConfig({ [key]: value })
      await restartCore()
    } catch (e) {
      notify(e, { variant: 'danger' })
    } finally {
      PubSub.publish('mihomo-core-changed')
    }
  }
  const [safePathsInput, setSafePathsInput] = useState(safePaths)

  return (
    <SettingCard header={tr('Environment variables')}>
      <SettingItem compatKey="legacy" title={tr('Disable system CAs')} divider>
        <Switch
          size="sm"
          isSelected={disableSystemCA}
          onValueChange={(v) => {
            handleConfigChangeWithRestart('disableSystemCA', v)
          }}
        />
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('Disable built-in CAs')} divider>
        <Switch
          size="sm"
          isSelected={disableEmbedCA}
          onValueChange={(v) => {
            handleConfigChangeWithRestart('disableEmbedCA', v)
          }}
        />
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('Disable loopback detection')} divider>
        <Switch
          size="sm"
          isSelected={disableLoopbackDetector}
          onValueChange={(v) => {
            handleConfigChangeWithRestart('disableLoopbackDetector', v)
          }}
        />
      </SettingItem>
      {platform == 'linux' && (
        <SettingItem compatKey="legacy" title={tr('Disable nftables')} divider>
          <Switch
            size="sm"
            isSelected={disableNftables}
            onValueChange={(v) => {
              handleConfigChangeWithRestart('disableNftables', v)
            }}
          />
        </SettingItem>
      )}
      <SettingItem compatKey="legacy" title={tr('Trusted path')}>
        {safePathsInput.join('') != safePaths.join('') && (
          <Button
            size="sm"
            color="primary"
            onPress={() => {
              handleConfigChangeWithRestart('safePaths', safePathsInput)
            }}
          >
            {tr('Confirm')}
          </Button>
        )}
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
