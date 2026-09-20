import { tr } from '../../../../shared/i18n'
import { useEffect, useState } from 'react'
import { Switch } from '@heroui/react'
import { KokoTextField as Input } from '../base/koko-form'
import PendingFieldAction from '../base/base-pending-field-action'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'

const LogSetting: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    saveLogs = true,
    maxLogDays = 7,
    maxLogFileSizeMB = 20,
    maxLogEntries = 500
  } = appConfig || {}

  const [maxLogDaysInput, setMaxLogDaysInput] = useState(maxLogDays)
  const [maxLogFileSizeMBInput, setMaxLogFileSizeMBInput] = useState(maxLogFileSizeMB)
  const [maxLogEntriesInput, setMaxLogEntriesInput] = useState(maxLogEntries)

  useEffect(() => {
    setMaxLogDaysInput(maxLogDays)
  }, [maxLogDays])

  useEffect(() => {
    setMaxLogFileSizeMBInput(maxLogFileSizeMB)
  }, [maxLogFileSizeMB])

  useEffect(() => {
    setMaxLogEntriesInput(maxLogEntries)
  }, [maxLogEntries])

  return (
    <SettingCard>
      <SettingItem
        contentAlign="end"
        title={tr('Save logs')}
        help={tr(
          'When disabled, logs are no longer written to local files. The live log view still shows the current session'
        )}
        divider
      >
        <Switch
          size="sm"
          isSelected={saveLogs}
          onChange={(value) => {
            patchAppConfig({ saveLogs: value })
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </SettingItem>
      <SettingItem contentAlign="end" title={tr('Log retention days')} divider>
        <div className="flex items-center justify-end gap-2">
          <Input
            size="sm"
            type="number"
            controlWidth="number"
            endContent={tr('days')}
            value={maxLogDaysInput.toString()}
            min={1}
            isDisabled={!saveLogs}
            onValueChange={(value) => {
              setMaxLogDaysInput(Math.max(parseInt(value) || 0, 1))
            }}
          />
          <PendingFieldAction
            isDisabled={!saveLogs}
            isVisible={saveLogs && maxLogDaysInput !== maxLogDays}
            onPress={() => patchAppConfig({ maxLogDays: maxLogDaysInput })}
          />
        </div>
      </SettingItem>
      <SettingItem
        contentAlign="end"
        title={tr('Log file size limit')}
        help={tr(
          'Only affects local log files. The oldest lines are removed when the size limit is exceeded'
        )}
        divider
      >
        <div className="flex items-center justify-end gap-2">
          <Input
            size="sm"
            type="number"
            controlWidth="number"
            endContent="MB"
            value={maxLogFileSizeMBInput.toString()}
            min={1}
            isDisabled={!saveLogs}
            onValueChange={(value) => {
              setMaxLogFileSizeMBInput(Math.max(parseInt(value) || 0, 1))
            }}
          />
          <PendingFieldAction
            isDisabled={!saveLogs}
            isVisible={saveLogs && maxLogFileSizeMBInput !== maxLogFileSizeMB}
            onPress={() => patchAppConfig({ maxLogFileSizeMB: maxLogFileSizeMBInput })}
          />
        </div>
      </SettingItem>
      <SettingItem
        contentAlign="end"
        title={tr('Live log entry limit')}
        help={tr('Only affects entries retained in the live log view, not local log files')}
      >
        <div className="flex items-center justify-end gap-2">
          <Input
            size="sm"
            type="number"
            controlWidth="number"
            endContent={tr('entries')}
            value={maxLogEntriesInput.toString()}
            min={1}
            onValueChange={(value) => {
              setMaxLogEntriesInput(Math.max(parseInt(value) || 0, 1))
            }}
          />
          <PendingFieldAction
            isVisible={maxLogEntriesInput !== maxLogEntries}
            onPress={() => patchAppConfig({ maxLogEntries: maxLogEntriesInput })}
          />
        </div>
      </SettingItem>
    </SettingCard>
  )
}

export default LogSetting
