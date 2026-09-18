import { Drawer } from '@heroui-v3/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface PageSettingsDrawerProps {
  title: string
  children: ReactNode
  onClose: () => void
  reopenSignal?: number
  width?: 'default' | 'wide'
}

interface PageSettingsSectionProps {
  title: string
  description?: string
  children: ReactNode
}

const DRAWER_CLOSE_ANIMATION_MS = 700

export const PageSettingsSection: React.FC<PageSettingsSectionProps> = ({
  title,
  description,
  children
}) => (
  <section className="border-t border-separator/70 py-4 first:border-t-0 first:pt-0 last:pb-0">
    <header className="mb-2 px-1">
      <h3 className="text-sm font-semibold text-foreground-600">{title}</h3>
      {description && <p className="mt-1 text-xs leading-5 text-foreground-500">{description}</p>}
    </header>
    <div className="flex flex-col gap-1">{children}</div>
  </section>
)

const PageSettingsDrawer: React.FC<PageSettingsDrawerProps> = ({
  title,
  children,
  onClose,
  reopenSignal,
  width = 'default'
}) => {
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

  const widthClass =
    width === 'wide' ? 'w-[min(520px,calc(100vw-32px))]' : 'w-[min(460px,calc(100vw-32px))]'

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
        <Drawer.Dialog
          className={`flag-emoji flex h-full ${widthClass} max-w-none flex-col overflow-hidden rounded-2xl! border border-separator/70 bg-overlay p-0 shadow-overlay`}
        >
          <Drawer.Header className="border-b border-separator/70 px-5 py-4">
            <Drawer.Heading className="text-base font-semibold">{title}</Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="no-scrollbar flex-1 overflow-y-auto px-5 py-4">
            {children}
          </Drawer.Body>
          <Drawer.CloseTrigger className="app-nodrag" />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

export default PageSettingsDrawer
