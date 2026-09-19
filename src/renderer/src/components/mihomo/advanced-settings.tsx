import { tr } from '../../../../shared/i18n'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import InterfaceSelect from '../base/interface-select'
import {
  KokoButton as Button,
  KokoSwitch as Switch,
  KokoTextField as Input,
  KokoTooltip as Tooltip
} from '../base/koko-form'
import { SettingTabs } from '../base/base-controls'
import { IoIosHelpCircle } from 'react-icons/io'
import React from 'react'

interface AdvancedSettingProps {
  config: Partial<MihomoConfig>
  onChange: (patch: Partial<MihomoConfig>) => void
}

const AdvancedSetting: React.FC<AdvancedSettingProps> = ({ config, onChange }) => {
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
  } = config
  const { 'store-selected': storeSelected, 'store-fake-ip': storeFakeIp } = profile
  const { device = 'mihomo' } = tun

  return (
    <SettingCard header={tr('Advanced settings')}>
      <SettingItem title={tr('Find process')} divider>
        <SettingTabs
          ariaLabel={tr('Find process')}
          selectedKey={findProcessMode}
          options={[
            { id: 'strict', label: tr('Automatic') },
            { id: 'off', label: tr('Off') },
            { id: 'always', label: tr('Enabled') }
          ]}
          onChange={(key) => {
            onChange({ 'find-process-mode': key as FindProcessMode })
          }}
        />
      </SettingItem>
      <SettingItem title={tr('Remember selected proxies')} divider>
        <Switch
          size="sm"
          isSelected={storeSelected}
          onValueChange={(v) => {
            onChange({ profile: { 'store-selected': v } })
          }}
        />
      </SettingItem>
      <SettingItem title={tr('Persist FakeIP mappings')} divider>
        <Switch
          size="sm"
          isSelected={storeFakeIp}
          onValueChange={(v) => {
            onChange({ profile: { 'store-fake-ip': v } })
          }}
        />
      </SettingItem>
      <SettingItem
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
            onChange({ 'unified-delay': v })
          }}
        />
      </SettingItem>
      <SettingItem
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
            onChange({ 'tcp-concurrent': v })
          }}
        />
      </SettingItem>
      <SettingItem title={tr('Disable TCP keep-alive')} divider>
        <Switch
          size="sm"
          isSelected={disableKeepAlive}
          onValueChange={(v) => {
            onChange({ 'disable-keep-alive': v })
          }}
        />
      </SettingItem>
      <SettingItem title={tr('TCP keep-alive interval')} divider>
        <Input
          size="sm"
          type="number"
          className="w-25"
          value={interval.toString()}
          min={0}
          onValueChange={(v) => onChange({ 'keep-alive-interval': parseInt(v) || 0 })}
        />
      </SettingItem>
      <SettingItem title={tr('TCP keep-alive idle time')} divider>
        <Input
          size="sm"
          type="number"
          className="w-25"
          value={idle.toString()}
          min={0}
          onValueChange={(v) => onChange({ 'keep-alive-idle': parseInt(v) || 0 })}
        />
      </SettingItem>
      <SettingItem title={tr('Set outbound interface')}>
        <InterfaceSelect
          value={interfaceName}
          exclude={[device, 'lo']}
          onChange={(iface) => onChange({ 'interface-name': iface })}
        />
      </SettingItem>
    </SettingCard>
  )
}

export default AdvancedSetting
