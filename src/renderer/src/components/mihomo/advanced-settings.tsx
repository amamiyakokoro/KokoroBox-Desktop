import { tr } from '../../../../shared/i18n'
import { Button, Switch, Tooltip } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import InterfaceSelect from '../base/interface-select'
import { KokoTextField as Input } from '../base/koko-form'
import { KokoSegmentedControl } from '../base/base-controls'
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
        <KokoSegmentedControl
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
          onChange={(v) => {
            onChange({ profile: { 'store-selected': v } })
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </SettingItem>
      <SettingItem title={tr('Persist FakeIP mappings')} divider>
        <Switch
          size="sm"
          isSelected={storeFakeIp}
          onChange={(v) => {
            onChange({ profile: { 'store-fake-ip': v } })
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </SettingItem>
      <SettingItem
        title={tr('Use RTT latency tests')}
        actions={
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button isIconOnly size="sm" variant="ghost">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {tr('Use a unified latency test to eliminate differences in proxy handshake times')}
            </Tooltip.Content>
          </Tooltip>
        }
        divider
      >
        <Switch
          size="sm"
          isSelected={unifiedDelay}
          onChange={(v) => {
            onChange({ 'unified-delay': v })
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </SettingItem>
      <SettingItem
        title={tr('Concurrent TCP connections')}
        actions={
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button isIconOnly size="sm" variant="ghost">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {tr(
                'Connect concurrently to IP addresses returned by DNS and use the connection with the fastest handshake'
              )}
            </Tooltip.Content>
          </Tooltip>
        }
        divider
      >
        <Switch
          size="sm"
          isSelected={tcpConcurrent}
          onChange={(v) => {
            onChange({ 'tcp-concurrent': v })
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </SettingItem>
      <SettingItem title={tr('Disable TCP keep-alive')} divider>
        <Switch
          size="sm"
          isSelected={disableKeepAlive}
          onChange={(v) => {
            onChange({ 'disable-keep-alive': v })
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
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
