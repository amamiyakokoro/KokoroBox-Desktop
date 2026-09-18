import { tr } from '../../../../shared/i18n'
import { Button, InputGroup, ListBox, Select, Switch } from '@heroui-v3/react'
import React, { useEffect, useState } from 'react'
import SettingItem from '../base/base-setting-item'
import { settingItemProps } from '../base/base-controls'
import PageSettingsDrawer, { PageSettingsSection } from '../base/base-settings-drawer'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { restartMihomoConnections } from '@renderer/utils/ipc'
import { HiSortAscending, HiSortDescending } from 'react-icons/hi'

interface Props {
  onClose: () => void
  reopenSignal?: number
}

const ConnectionSettingDrawer: React.FC<Props> = (props) => {
  const { onClose, reopenSignal } = props
  const { appConfig, patchAppConfig } = useAppConfig()

  const {
    displayIcon = true,
    displayAppName = true,
    connectionInterval = 500,
    connectionGroupByProcess = false,
    connectionGroupSort = 'name',
    connectionGroupDirection = 'asc'
  } = appConfig || {}
  const [intervalInput, setIntervalInput] = useState(connectionInterval)

  useEffect(() => {
    setIntervalInput(connectionInterval)
  }, [connectionInterval])

  const applyInterval = (): void => {
    const actualValue = Math.min(10000, Math.max(100, intervalInput))
    setIntervalInput(actualValue)
    if (actualValue === connectionInterval) return
    patchAppConfig({ connectionInterval: actualValue })
    restartMihomoConnections()
  }

  return (
    <PageSettingsDrawer
      title={tr('Connection settings')}
      onClose={onClose}
      reopenSignal={reopenSignal}
    >
      <PageSettingsSection title={tr('Display')}>
        <SettingItem title={tr('Show app icon')} {...settingItemProps} divider>
          <Switch
            aria-label={tr('Show app icon')}
            isSelected={displayIcon}
            onChange={(v) => {
              patchAppConfig({ displayIcon: v })
            }}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <SettingItem title={tr('Show app name')} {...settingItemProps}>
          <Switch
            aria-label={tr('Show app name')}
            isSelected={displayAppName}
            onChange={(v) => {
              patchAppConfig({ displayAppName: v })
            }}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
      </PageSettingsSection>

      <PageSettingsSection title={tr('Grouping and sorting')}>
        <SettingItem
          title={tr('Group by process')}
          {...settingItemProps}
          divider={connectionGroupByProcess}
        >
          <Switch
            aria-label={tr('Group by process')}
            isSelected={connectionGroupByProcess}
            onChange={(v) => {
              patchAppConfig({ connectionGroupByProcess: v })
            }}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        {connectionGroupByProcess && (
          <SettingItem title={tr('Group sort order')} {...settingItemProps}>
            <div className="flex items-center justify-end gap-2">
              <Select
                aria-label={tr('Group sort field')}
                variant="secondary"
                value={connectionGroupSort}
                onChange={(value) => {
                  if (Array.isArray(value) || value == null) return
                  if (value === connectionGroupSort) return
                  patchAppConfig({
                    connectionGroupSort: value as
                      'name' | 'count' | 'upload' | 'download' | 'uploadSpeed' | 'downloadSpeed'
                  })
                }}
              >
                <Select.Trigger className="h-8 min-h-8 py-0">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="name" textValue={tr('Name')}>
                      {tr('Name')}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="count" textValue={tr('Connection count')}>
                      {tr('Connection count')}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="upload" textValue={tr('Uploaded')}>
                      {tr('Uploaded')}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="download" textValue={tr('Downloaded')}>
                      {tr('Downloaded')}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="uploadSpeed" textValue={tr('Upload speed')}>
                      {tr('Upload speed')}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="downloadSpeed" textValue={tr('Download speed')}>
                      {tr('Download speed')}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              <Button
                size="sm"
                isIconOnly
                variant="secondary"
                className="h-8 w-8 shrink-0"
                aria-label={connectionGroupDirection === 'asc' ? tr('Ascending') : tr('Descending')}
                onPress={() => {
                  patchAppConfig({
                    connectionGroupDirection: connectionGroupDirection === 'asc' ? 'desc' : 'asc'
                  })
                }}
              >
                {connectionGroupDirection === 'asc' ? (
                  <HiSortAscending className="text-lg" />
                ) : (
                  <HiSortDescending className="text-lg" />
                )}
              </Button>
            </div>
          </SettingItem>
        )}
      </PageSettingsSection>

      <PageSettingsSection title={tr('Refresh')}>
        <SettingItem title={tr('Refresh interval')} {...settingItemProps}>
          <InputGroup data-setting-input="number" variant="secondary">
            <InputGroup.Input
              aria-label={tr('Refresh interval')}
              type="number"
              value={intervalInput.toString()}
              max={10000}
              min={100}
              onBlur={applyInterval}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              onChange={(event) => {
                setIntervalInput(parseInt(event.target.value) || 100)
              }}
            />
            <InputGroup.Suffix>ms</InputGroup.Suffix>
          </InputGroup>
        </SettingItem>
      </PageSettingsSection>
    </PageSettingsDrawer>
  )
}

export default ConnectionSettingDrawer
