import { tr } from '../../../../shared/i18n'
import { Button, Drawer } from '@heroui-v3/react'
import { useEffect, useRef, useState } from 'react'
import { LuArrowRight } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import SettingItem from '../base/base-setting-item'
import { SettingTabs, settingItemProps } from '../base/base-controls'

interface Props {
  onClose: () => void
  reopenSignal?: number
}

const DRAWER_CLOSE_ANIMATION_MS = 700

const ProfileSettingDrawer: React.FC<Props> = ({ onClose, reopenSignal }) => {
  const navigate = useNavigate()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { profileDisplayDate = 'update' } = appConfig || {}
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
        <Drawer.Dialog className="flag-emoji flex h-full w-[min(460px,calc(100vw-32px))] max-w-none flex-col overflow-hidden rounded-2xl! border border-separator/70 bg-overlay p-0 shadow-overlay">
          <Drawer.Header className="border-b border-separator/70 px-5 py-4">
            <Drawer.Heading className="text-base font-semibold">
              {tr('Subscription settings')}
            </Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="no-scrollbar flex-1 overflow-y-auto px-5 py-3">
            <div className="flex flex-col gap-1">
              <SettingItem title={tr('Show date')} {...settingItemProps}>
                <SettingTabs
                  ariaLabel={tr('Show date')}
                  selectedKey={profileDisplayDate}
                  options={[
                    { id: 'update', label: tr('Last updated') },
                    { id: 'expire', label: tr('Expiration') }
                  ]}
                  onChange={async (value) => {
                    await patchAppConfig({
                      profileDisplayDate: value as 'expire' | 'update'
                    })
                  }}
                />
              </SettingItem>

              <section className="mt-3 border-t border-separator/70 px-1 py-4">
                <h3 className="text-sm font-semibold">{tr('Subscription data and sync')}</h3>
                <p className="mt-1 text-sm leading-5 text-foreground-500">
                  {tr('Global subscription and Gist settings are managed in Application settings.')}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onPress={() => {
                    onClose()
                    navigate('/settings?section=data')
                  }}
                >
                  <span>{tr('Open data and integrations')}</span>
                  <LuArrowRight className="text-base" />
                </Button>
              </section>
            </div>
          </Drawer.Body>
          <Drawer.CloseTrigger className="app-nodrag" />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

export default ProfileSettingDrawer
