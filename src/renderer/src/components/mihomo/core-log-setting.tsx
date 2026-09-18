import { tr } from '../../../../shared/i18n'
import { Select, SelectItem } from '@heroui/react'
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
        <Select
          aria-label={tr('Log level')}
          classNames={{ trigger: 'data-[hover=true]:bg-default-200' }}
          className="w-25"
          size="sm"
          selectedKeys={new Set([logLevel])}
          disallowEmptySelection
          onSelectionChange={(value) => {
            onChange({
              'log-level': value.currentKey as LogLevel
            })
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
