import { tr } from '../../../../shared/i18n'
/* eslint-disable react/prop-types */
import { Drawer, Switch } from '@heroui-v3/react'
import SettingItem from '../base/base-setting-item'
import { settingItemProps } from '../base/base-controls'
import { useEffect, useRef, useState } from 'react'

interface Props {
  isDisabled: boolean
  isProxyUdpDnsEnabled: boolean
  onProxyUdpDnsChange: (enabled: boolean) => void
  onClose: () => void
  reopenSignal?: number
}

const DRAWER_CLOSE_ANIMATION_MS = 700

const AppRoutingSettingDrawer: React.FC<Props> = (props) => {
  const { isDisabled, isProxyUdpDnsEnabled, onProxyUdpDnsChange, onClose, reopenSignal } = props
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
          </Drawer.Body>
          <Drawer.CloseTrigger className="app-nodrag" />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

export default AppRoutingSettingDrawer
