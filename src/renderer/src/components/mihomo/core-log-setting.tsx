import { tr } from '../../../../shared/i18n'
import { Select, SelectItem } from '@heroui/react'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { restartCore } from '@renderer/utils/ipc'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'

const CoreLogSetting: React.FC = () => {
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { 'log-level': logLevel = 'info' } = controledMihomoConfig || {}

  return (
    <SettingCard header={tr('Core logging')}>
      <SettingItem title={tr('Log level')}>
        <Select
          aria-label={tr('Log level')}
          classNames={{ trigger: 'data-[hover=true]:bg-default-200' }}
          className="w-25"
          size="sm"
          selectedKeys={new Set([logLevel])}
          disallowEmptySelection
          onSelectionChange={async (value) => {
            await patchControledMihomoConfig({
              'log-level': value.currentKey as LogLevel
            })
            await restartCore()
          }}
        >
          <SelectItem key="silent">silent</SelectItem>
          <SelectItem key="error">error</SelectItem>
          <SelectItem key="warning">warning</SelectItem>
          <SelectItem key="info">info</SelectItem>
          <SelectItem key="debug">debug</SelectItem>
        </Select>
      </SettingItem>
    </SettingCard>
  )
}

export default CoreLogSetting
