import { tr } from '../../../../shared/i18n'
import { KokoSelect } from '../base/koko-form'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import React from 'react'

interface CoreLogSettingProps {
  config: Partial<MihomoConfig>
  onChange: (patch: Partial<MihomoConfig>) => void
}

const CoreLogSetting: React.FC<CoreLogSettingProps> = ({ config, onChange }) => {
  const { 'log-level': logLevel = 'info' } = config

  return (
    <SettingCard header={tr('Core logging')}>
      <SettingItem title={tr('Log level')}>
        <KokoSelect
          aria-label={tr('Log level')}
          className="w-25"
          value={logLevel}
          options={['silent', 'error', 'warning', 'info', 'debug'].map((id) => ({
            id,
            label: id
          }))}
          disallowEmptySelection
          onChange={(value) => {
            onChange({
              'log-level': value as LogLevel
            })
          }}
        />
      </SettingItem>
    </SettingCard>
  )
}

export default CoreLogSetting
