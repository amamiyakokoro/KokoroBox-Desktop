import { tr } from '../../../../shared/i18n'
import { useEffect, useState } from 'react'
import { Button, Switch, Tooltip } from '@heroui/react'
import { KokoTextField as Input } from '../base/koko-form'
import { IoIosHelpCircle } from 'react-icons/io'
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
        actions={
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button isIconOnly size="sm" variant="ghost">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {tr(
                'When disabled, logs are no longer written to local files. The live log view still shows the current session'
              )}
            </Tooltip.Content>
          </Tooltip>
        }
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
        <div className="flex">
          {saveLogs && maxLogDaysInput !== maxLogDays && (
            <Button
              size="sm"
              variant="primary"
              className="mr-2"
              onPress={() => {
                patchAppConfig({ maxLogDays: maxLogDaysInput })
              }}
            >
              {tr('Confirm')}
            </Button>
          )}
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
        </div>
      </SettingItem>
      <SettingItem
        contentAlign="end"
        title={tr('Log file size limit')}
        actions={
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button isIconOnly size="sm" variant="ghost">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {tr(
                'Only affects local log files. The oldest lines are removed when the size limit is exceeded'
              )}
            </Tooltip.Content>
          </Tooltip>
        }
        divider
      >
        <div className="flex">
          {saveLogs && maxLogFileSizeMBInput !== maxLogFileSizeMB && (
            <Button
              size="sm"
              variant="primary"
              className="mr-2"
              onPress={() => {
                patchAppConfig({ maxLogFileSizeMB: maxLogFileSizeMBInput })
              }}
            >
              {tr('Confirm')}
            </Button>
          )}
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
        </div>
      </SettingItem>
      <SettingItem
        contentAlign="end"
        title={tr('Live log entry limit')}
        actions={
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button isIconOnly size="sm" variant="ghost">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {tr('Only affects entries retained in the live log view, not local log files')}
            </Tooltip.Content>
          </Tooltip>
        }
      >
        <div className="flex">
          {maxLogEntriesInput !== maxLogEntries && (
            <Button
              size="sm"
              variant="primary"
              className="mr-2"
              onPress={() => {
                patchAppConfig({ maxLogEntries: maxLogEntriesInput })
              }}
            >
              {tr('Confirm')}
            </Button>
          )}
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
        </div>
      </SettingItem>
    </SettingCard>
  )
}

export default LogSetting
