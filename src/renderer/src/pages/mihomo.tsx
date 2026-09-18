import { tr } from '../../../shared/i18n'
import { Switch } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import SettingItem from '@renderer/components/base/base-setting-item'
import FeatureSettingsLayout, {
  FeatureSettingsSection
} from '@renderer/components/base/base-feature-settings'
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
      <FeatureSettingsLayout>
        <FeatureSettingsSection title={tr('Core network')}>
          <SettingItem title="IPv6">
            <Switch
              size="sm"
              isSelected={ipv6}
              onValueChange={(value) => onChangeNeedRestart({ ipv6: value })}
            />
          </SettingItem>
        </FeatureSettingsSection>
        <PortSetting />
        <ControllerSetting />
        <CoreLogSetting />
        <AdvancedSetting />
      </FeatureSettingsLayout>
    </BasePage>
  )
}

export default Mihomo
