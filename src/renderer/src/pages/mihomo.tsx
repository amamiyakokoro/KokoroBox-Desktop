import { tr } from '../../../shared/i18n'
import { Switch } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import PortSetting from '@renderer/components/mihomo/port-setting'
import ControllerSetting from '@renderer/components/mihomo/controller-setting'
import AdvancedSetting from '@renderer/components/mihomo/advanced-settings'
import CoreLogSetting from '@renderer/components/mihomo/core-log-setting'
import { restartCore } from '@renderer/utils/ipc'
import React from 'react'

const Mihomo: React.FC = () => {
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { ipv6 } = controledMihomoConfig || {}

  const onChangeNeedRestart = async (patch: Partial<MihomoConfig>): Promise<void> => {
    await patchControledMihomoConfig(patch)
    await restartCore()
  }

  return (
    <BasePage title={tr('Mihomo settings')} contentClassName="no-scrollbar">
      <SettingCard>
        <SettingItem compatKey="legacy" title="IPv6">
          <Switch
            size="sm"
            isSelected={ipv6}
            onValueChange={(value) => onChangeNeedRestart({ ipv6: value })}
          />
        </SettingItem>
      </SettingCard>
      <PortSetting />
      <ControllerSetting />
      <CoreLogSetting />
      <AdvancedSetting />
    </BasePage>
  )
}

export default Mihomo
