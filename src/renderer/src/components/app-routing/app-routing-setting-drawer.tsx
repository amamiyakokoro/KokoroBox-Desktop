import { tr } from '../../../../shared/i18n'
/* eslint-disable react/prop-types */
import { Button, Drawer, ListBox, Select, Separator, Switch, Tooltip } from '@heroui-v3/react'
import SettingItem from '../base/base-setting-item'
import { settingItemProps } from '../base/base-controls'
import { useEffect, useRef, useState } from 'react'
import { IoIosHelpCircle } from 'react-icons/io'

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

const DRAWER_CLOSE_ANIMATION_MS = 700

function SettingHelp({ label, content }: { label: string; content: string }): React.ReactNode {
  return (
    <Tooltip delay={0}>
      <Button aria-label={`${label} ${tr('Description')}`} isIconOnly size="sm" variant="ghost">
        <IoIosHelpCircle className="text-lg" />
      </Button>
      <Tooltip.Content>{content}</Tooltip.Content>
    </Tooltip>
  )
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
  const [isOpen, setIsOpen] = useState(true)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  useEffect(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setIsOpen(true)
  }, [reopenSignal])

  const closeWithAnimation = (): void => {
    if (closeTimer.current) return
    setIsOpen(false)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      onClose()
    }, DRAWER_CLOSE_ANIMATION_MS)
  }

  return (
    <Drawer.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) closeWithAnimation()
      }}
      variant="blur"
      className="top-12 h-[calc(100%-48px)]"
    >
      <Drawer.Content placement="right" className="top-12 h-[calc(100%-48px)] p-3 pl-0">
        <Drawer.Dialog className="flex h-full w-[min(460px,calc(100vw-32px))] max-w-none flex-col overflow-hidden rounded-2xl! border border-separator/70 bg-overlay p-0 shadow-overlay">
          <Drawer.Header className="border-b border-separator/70 px-5 py-4">
            <Drawer.Heading className="text-base font-semibold">
              {tr('Application routing settings')}
            </Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="no-scrollbar flex-1 overflow-y-auto px-5 py-3">
            <SettingItem
              title={tr('Proxy application UDP DNS')}
              actions={
                <SettingHelp
                  label={tr('Proxy application UDP DNS')}
                  content={tr(
                    'Send UDP/53 queries issued by applications with Proxy rules through Mihomo.'
                  )}
                />
              }
              {...settingItemProps}
              divider
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
            <SettingItem title={tr('Default action for new rules')} {...settingItemProps} divider>
              <Select
                aria-label={tr('Default action for new rules')}
                className="w-36"
                variant="secondary"
                value={defaultAction}
                isDisabled={isDisabled}
                onChange={(value) => {
                  if (Array.isArray(value) || value == null) return
                  onDefaultActionChange(value as AppRoutingAction)
                }}
              >
                <Select.Trigger className="h-8 min-h-8 py-0">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="proxy" textValue="Proxy">
                      Proxy
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="direct" textValue="Direct">
                      Direct
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="block" textValue="Block">
                      Block
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </SettingItem>
            <SettingItem title={tr('Default protocol for new rules')} {...settingItemProps}>
              <Select
                aria-label={tr('Default protocol for new rules')}
                className="w-36"
                variant="secondary"
                value={defaultProtocol}
                isDisabled={isDisabled}
                onChange={(value) => {
                  if (Array.isArray(value) || value == null) return
                  onDefaultProtocolChange(value as AppRoutingProtocol)
                }}
              >
                <Select.Trigger className="h-8 min-h-8 py-0">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="both" textValue="TCP + UDP">
                      TCP + UDP
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="tcp" textValue="TCP">
                      TCP
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="udp" textValue="UDP">
                      UDP
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </SettingItem>

            <Separator className="my-4" />
            <h3 className="mb-2 text-sm font-semibold text-foreground-600">
              {tr('Advanced options')}
            </h3>
            <SettingItem
              title={tr('Diagnostic logging')}
              actions={
                <SettingHelp
                  label={tr('Diagnostic logging')}
                  content={tr(
                    'Log application routing destinations and decisions. Enable only while troubleshooting.'
                  )}
                />
              }
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
                actions={
                  <SettingHelp
                    label={tr('macOS Network Extension')}
                    content={tr(
                      'Open System Settings and request approval for the KokoroBox Network Extension again.'
                    )}
                  />
                }
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
                actions={
                  <SettingHelp
                    label={tr('Application routing firewall')}
                    content={tr(
                      'Check and repair the ProxyBridge relay rules for 34010/TCP and 34011/UDP.'
                    )}
                  />
                }
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
          </Drawer.Body>
          <Drawer.CloseTrigger className="app-nodrag" />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

export default AppRoutingSettingDrawer
