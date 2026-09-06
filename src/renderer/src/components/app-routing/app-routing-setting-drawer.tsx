import { tr } from '../../../../shared/i18n'
/* eslint-disable react/prop-types */
import { Drawer, ListBox, Select, Separator, Switch } from '@heroui-v3/react'
import SettingItem from '../base/base-setting-item'
import { settingItemProps } from '../base/base-controls'
import { useEffect, useRef, useState } from 'react'

interface Props {
  isDisabled: boolean
  isProxyUdpDnsEnabled: boolean
  defaultAction: AppRoutingAction
  defaultProtocol: AppRoutingProtocol
  diagnosticLogging: boolean
  onProxyUdpDnsChange: (enabled: boolean) => void
  onDefaultActionChange: (action: AppRoutingAction) => void
  onDefaultProtocolChange: (protocol: AppRoutingProtocol) => void
  onDiagnosticLoggingChange: (enabled: boolean) => void
  onClose: () => void
  reopenSignal?: number
}

const DRAWER_CLOSE_ANIMATION_MS = 700

const AppRoutingSettingDrawer: React.FC<Props> = (props) => {
  const {
    isDisabled,
    isProxyUdpDnsEnabled,
    defaultAction,
    defaultProtocol,
    diagnosticLogging,
    onProxyUdpDnsChange,
    onDefaultActionChange,
    onDefaultProtocolChange,
    onDiagnosticLoggingChange,
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
              {tr('应用分流设置')}
            </Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="no-scrollbar flex-1 overflow-y-auto px-5 py-3">
            <SettingItem
              title={
                <div>
                  <div>{tr('代理应用程序 UDP DNS')}</div>
                  <p className="mt-1 text-xs font-normal text-foreground-500">
                    {tr('将 Proxy 规则应用程序自行发出的 UDP/53 查询交给 Mihomo。')}
                  </p>
                </div>
              }
              {...settingItemProps}
              divider
            >
              <Switch
                aria-label={tr('代理应用程序 UDP DNS')}
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
            <SettingItem title={tr('新规则默认动作')} {...settingItemProps} divider>
              <Select
                aria-label={tr('新规则默认动作')}
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
            <SettingItem title={tr('新规则默认协议')} {...settingItemProps}>
              <Select
                aria-label={tr('新规则默认协议')}
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
            <h3 className="mb-2 text-sm font-semibold text-foreground-600">{tr('进阶设置')}</h3>
            <SettingItem
              title={
                <div>
                  <div>{tr('诊断记录')}</div>
                  <p className="mt-1 text-xs font-normal text-foreground-500">
                    {tr('记录应用程序分流的匹配目标与处理结果；仅在排查问题时启用。')}
                  </p>
                </div>
              }
              {...settingItemProps}
            >
              <Switch
                aria-label={tr('诊断记录')}
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
          </Drawer.Body>
          <Drawer.CloseTrigger className="app-nodrag" />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

export default AppRoutingSettingDrawer
