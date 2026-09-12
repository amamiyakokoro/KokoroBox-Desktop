import { tr } from '../../../../shared/i18n'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import InterfaceSelect from '../base/interface-select'
import { restartCore } from '@renderer/utils/ipc'
import { Button, Input, Switch, Tab, Tabs, Tooltip } from '@heroui/react'
import { useState } from 'react'
import { IoIosHelpCircle } from 'react-icons/io'

const AdvancedSetting: React.FC = () => {
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const {
    'unified-delay': unifiedDelay,
    'tcp-concurrent': tcpConcurrent,
    'disable-keep-alive': disableKeepAlive = false,
    'find-process-mode': findProcessMode = 'always',
    'interface-name': interfaceName = '',
    'keep-alive-idle': idle = 15,
    'keep-alive-interval': interval = 15,
    profile = {},
    tun = {}
  } = controledMihomoConfig || {}
  const { 'store-selected': storeSelected, 'store-fake-ip': storeFakeIp } = profile
  const { device = 'mihomo' } = tun

  const [idleInput, setIdleInput] = useState(idle)
  const [intervalInput, setIntervalInput] = useState(interval)

  const onChangeNeedRestart = async (patch: Partial<MihomoConfig>): Promise<void> => {
    await patchControledMihomoConfig(patch)
    await restartCore()
  }

  return (
    <SettingCard header={tr('Advanced settings')}>
      <SettingItem compatKey="legacy" title={tr('Find process')} divider>
        <Tabs
          size="sm"
          color="primary"
          selectedKey={findProcessMode}
          onSelectionChange={(key) => {
            onChangeNeedRestart({ 'find-process-mode': key as FindProcessMode })
          }}
        >
          <Tab key="strict" title={tr('Automatic')}></Tab>
          <Tab key="off" title={tr('Off')}></Tab>
          <Tab key="always" title={tr('Enabled')}></Tab>
        </Tabs>
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('Remember selected proxies')} divider>
        <Switch
          size="sm"
          isSelected={storeSelected}
          onValueChange={(v) => {
            onChangeNeedRestart({ profile: { 'store-selected': v } })
          }}
        />
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('Persist FakeIP mappings')} divider>
        <Switch
          size="sm"
          isSelected={storeFakeIp}
          onValueChange={(v) => {
            onChangeNeedRestart({ profile: { 'store-fake-ip': v } })
          }}
        />
      </SettingItem>
      <SettingItem
        compatKey="legacy"
        title={tr('Use RTT latency tests')}
        actions={
          <Tooltip
            content={tr(
              'Use a unified latency test to eliminate differences in proxy handshake times'
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
          isSelected={unifiedDelay}
          onValueChange={(v) => {
            onChangeNeedRestart({ 'unified-delay': v })
          }}
        />
      </SettingItem>
      <SettingItem
        compatKey="legacy"
        title={tr('Concurrent TCP connections')}
        actions={
          <Tooltip
            content={tr(
              'Connect concurrently to IP addresses returned by DNS and use the connection with the fastest handshake'
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
          isSelected={tcpConcurrent}
          onValueChange={(v) => {
            onChangeNeedRestart({ 'tcp-concurrent': v })
          }}
        />
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('Disable TCP keep-alive')} divider>
        <Switch
          size="sm"
          isSelected={disableKeepAlive}
          onValueChange={(v) => {
            onChangeNeedRestart({ 'disable-keep-alive': v })
          }}
        />
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('TCP keep-alive interval')} divider>
        <div className="flex">
          {intervalInput !== interval && (
            <Button
              size="sm"
              color="primary"
              className="mr-2"
              onPress={async () => {
                await onChangeNeedRestart({ 'keep-alive-interval': intervalInput })
              }}
            >
              {tr('Confirm')}
            </Button>
          )}
          <Input
            size="sm"
            type="number"
            className="w-25"
            value={intervalInput.toString()}
            min={0}
            onValueChange={(v) => {
              setIntervalInput(parseInt(v) || 0)
            }}
          />
        </div>
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('TCP keep-alive idle time')} divider>
        <div className="flex">
          {idleInput !== idle && (
            <Button
              size="sm"
              color="primary"
              className="mr-2"
              onPress={async () => {
                await onChangeNeedRestart({ 'keep-alive-idle': idleInput })
              }}
            >
              {tr('Confirm')}
            </Button>
          )}
          <Input
            size="sm"
            type="number"
            className="w-25"
            value={idleInput.toString()}
            min={0}
            onValueChange={(v) => {
              setIdleInput(parseInt(v) || 0)
            }}
          />
        </div>
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('Set outbound interface')}>
        <InterfaceSelect
          value={interfaceName}
          exclude={[device, 'lo']}
          onChange={(iface) => onChangeNeedRestart({ 'interface-name': iface })}
        />
      </SettingItem>
    </SettingCard>
  )
}

export default AdvancedSetting
