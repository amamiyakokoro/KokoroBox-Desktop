/* eslint-disable react/prop-types */
import { tr } from '../../../../shared/i18n'
import { Button, Switch } from '@heroui/react'
import SettingItem from '../base/base-setting-item'
import { settingItemProps } from '../base/base-controls'
import PageSettingsDrawer, { PageSettingsSection } from '../base/base-settings-drawer'
import { KokoSelect } from '../base/koko-form'

interface Props {
  isDisabled: boolean
  isMac: boolean
  isWindows: boolean
  isOpeningSystemSettings: boolean
  isRepairingFirewall: boolean
  isProxyUdpDnsEnabled: boolean
  defaultAction: AppRoutingAction
  defaultProtocol: AppRoutingProtocol
  diagnosticLogging: boolean
  onProxyUdpDnsChange: (enabled: boolean) => void
  onDefaultActionChange: (action: AppRoutingAction) => void
  onDefaultProtocolChange: (protocol: AppRoutingProtocol) => void
  onDiagnosticLoggingChange: (enabled: boolean) => void
  onOpenSystemSettings: () => void
  onRepairFirewall: () => void
  onClose: () => void
  reopenSignal?: number
}

const AppRoutingSettingDrawer: React.FC<Props> = (props) => {
  const {
    isDisabled,
    isMac,
    isWindows,
    isOpeningSystemSettings,
    isRepairingFirewall,
    isProxyUdpDnsEnabled,
    defaultAction,
    defaultProtocol,
    diagnosticLogging,
    onProxyUdpDnsChange,
    onDefaultActionChange,
    onDefaultProtocolChange,
    onDiagnosticLoggingChange,
    onOpenSystemSettings,
    onRepairFirewall,
    onClose,
    reopenSignal
  } = props
  return (
    <PageSettingsDrawer
      title={tr('Application routing settings')}
      onClose={onClose}
      reopenSignal={reopenSignal}
    >
      <PageSettingsSection title={tr('Rule defaults')}>
        <SettingItem title={tr('Default action for new rules')} {...settingItemProps} divider>
          <KokoSelect
            aria-label={tr('Default action for new rules')}
            controlWidth="select"
            density="compact"
            variant="secondary"
            disallowEmptySelection
            value={defaultAction}
            isDisabled={isDisabled}
            options={[
              { id: 'proxy', label: 'Proxy' },
              { id: 'direct', label: 'Direct' },
              { id: 'block', label: 'Block' }
            ]}
            onChange={(value) => onDefaultActionChange(value as AppRoutingAction)}
          />
        </SettingItem>
        <SettingItem title={tr('Default protocol for new rules')} {...settingItemProps}>
          <KokoSelect
            aria-label={tr('Default protocol for new rules')}
            controlWidth="select"
            density="compact"
            variant="secondary"
            disallowEmptySelection
            value={defaultProtocol}
            isDisabled={isDisabled}
            options={[
              { id: 'both', label: 'TCP + UDP' },
              { id: 'tcp', label: 'TCP' },
              { id: 'udp', label: 'UDP' }
            ]}
            onChange={(value) => onDefaultProtocolChange(value as AppRoutingProtocol)}
          />
        </SettingItem>
      </PageSettingsSection>

      <PageSettingsSection title={tr('DNS handling')}>
        <SettingItem
          title={tr('Proxy application UDP DNS')}
          description={tr(
            'Send UDP/53 queries issued by applications with Proxy rules through Mihomo.'
          )}
          {...settingItemProps}
        >
          <Switch
            aria-label={tr('Proxy application UDP DNS')}
            isSelected={isProxyUdpDnsEnabled}
            isDisabled={isDisabled}
            onChange={onProxyUdpDnsChange}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
      </PageSettingsSection>

      <PageSettingsSection title={tr('Diagnostics and system integration')}>
        <SettingItem
          title={tr('Diagnostic logging')}
          description={tr(
            'Log application routing destinations and decisions. Enable only while troubleshooting.'
          )}
          {...settingItemProps}
          divider={isMac || isWindows}
        >
          <Switch
            aria-label={tr('Diagnostic logging')}
            isSelected={diagnosticLogging}
            isDisabled={isDisabled}
            onChange={onDiagnosticLoggingChange}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        {isMac && (
          <SettingItem
            title={tr('macOS Network Extension')}
            description={tr(
              'Open System Settings and request approval for the KokoroBox Network Extension again.'
            )}
            {...settingItemProps}
          >
            <Button
              size="sm"
              variant="secondary"
              isPending={isOpeningSystemSettings}
              isDisabled={isDisabled}
              onPress={onOpenSystemSettings}
            >
              {tr('Open System Settings')}
            </Button>
          </SettingItem>
        )}
        {isWindows && (
          <SettingItem
            title={tr('Application routing firewall')}
            description={tr(
              'Check and repair the ProxyBridge relay rules for 34010/TCP and 34011/UDP.'
            )}
            {...settingItemProps}
          >
            <Button
              size="sm"
              variant="secondary"
              isPending={isRepairingFirewall}
              isDisabled={isDisabled}
              onPress={onRepairFirewall}
            >
              {tr('Check and repair')}
            </Button>
          </SettingItem>
        )}
      </PageSettingsSection>
    </PageSettingsDrawer>
  )
}

export default AppRoutingSettingDrawer
