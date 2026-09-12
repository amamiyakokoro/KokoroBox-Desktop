import { tr } from '../../../../shared/i18n'
import { useEffect, useState } from 'react'
import { Button, Input, Select, SelectItem, Switch, Tooltip } from '@heroui/react'
import { IoIosHelpCircle } from 'react-icons/io'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { restartCore } from '@renderer/utils/ipc'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'

const LogSetting: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const {
    saveLogs = true,
    maxLogDays = 7,
    maxLogFileSizeMB = 20,
    maxLogEntries = 500
  } = appConfig || {}
  const { 'log-level': logLevel = 'info' } = controledMihomoConfig || {}

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

  const onChangeNeedRestart = async (patch: Partial<MihomoConfig>): Promise<void> => {
    await patchControledMihomoConfig(patch)
    await restartCore()
  }

  return (
    <SettingCard header={tr('Log settings')}>
      <SettingItem
        compatKey="legacy"
        title={tr('Save logs')}
        actions={
          <Tooltip
            content={tr(
              'When disabled, logs are no longer written to local files. The live log view still shows the current session'
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
          isSelected={saveLogs}
          onValueChange={(value) => {
            patchAppConfig({ saveLogs: value })
          }}
        />
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('Log retention days')} divider>
        <div className="flex">
          {saveLogs && maxLogDaysInput !== maxLogDays && (
            <Button
              size="sm"
              color="primary"
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
            className="w-25"
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
        compatKey="legacy"
        title={tr('Log file size limit')}
        actions={
          <Tooltip
            content={tr(
              'Only affects local log files. The oldest lines are removed when the size limit is exceeded'
            )}
          >
            <Button isIconOnly size="sm" variant="light">
              <IoIosHelpCircle className="text-lg" />
            </Button>
          </Tooltip>
        }
        divider
      >
        <div className="flex">
          {saveLogs && maxLogFileSizeMBInput !== maxLogFileSizeMB && (
            <Button
              size="sm"
              color="primary"
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
            className="w-25"
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
        compatKey="legacy"
        title={tr('Live log entry limit')}
        actions={
          <Tooltip
            content={tr('Only affects entries retained in the live log view, not local log files')}
          >
            <Button isIconOnly size="sm" variant="light">
              <IoIosHelpCircle className="text-lg" />
            </Button>
          </Tooltip>
        }
        divider
      >
        <div className="flex">
          {maxLogEntriesInput !== maxLogEntries && (
            <Button
              size="sm"
              color="primary"
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
            className="w-25"
            endContent={tr('entries')}
            value={maxLogEntriesInput.toString()}
            min={1}
            onValueChange={(value) => {
              setMaxLogEntriesInput(Math.max(parseInt(value) || 0, 1))
            }}
          />
        </div>
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('Log level')}>
        <Select
          aria-label={tr('Log level')}
          classNames={{ trigger: 'data-[hover=true]:bg-default-200' }}
          className="w-25"
          size="sm"
          selectedKeys={new Set([logLevel])}
          disallowEmptySelection={true}
          onSelectionChange={(value) =>
            onChangeNeedRestart({ 'log-level': value.currentKey as LogLevel })
          }
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

export default LogSetting
