/* eslint-disable react/prop-types */
import { tr } from '../../../../shared/i18n'
import { Drawer } from '@heroui/react'
import { useId, type ReactNode } from 'react'

interface PageSettingsDrawerProps {
  title: string
  children: ReactNode
  onClose: () => void
  width?: 'default' | 'wide'
}

interface PageSettingsSectionProps {
  title: string
  description?: ReactNode
  children: ReactNode
}

export const PageSettingsSection: React.FC<PageSettingsSectionProps> = ({
  title,
  description,
  children
}) => {
  const headingId = useId()

  return (
    <section
      aria-labelledby={headingId}
      className="border-t border-separator/70 py-5 first:border-t-0 first:pt-0 last:pb-0"
    >
      <header className="mb-1.5 px-1">
        <h3 id={headingId} className="text-xs font-medium text-muted">
          {title}
        </h3>
        {description && <p className="mt-1 text-xs leading-4 text-muted">{description}</p>}
      </header>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

const PageSettingsDrawer: React.FC<PageSettingsDrawerProps> = ({
  title,
  children,
  onClose,
  width = 'default'
}) => {
  const widthClass =
    width === 'wide' ? 'w-[min(520px,calc(100vw-16px))]' : 'w-[min(432px,calc(100vw-16px))]'

  return (
    <Drawer.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      variant="transparent"
      className="page-settings-drawer-backdrop top-12 h-[calc(100%-48px)]"
    >
      <Drawer.Content
        placement="right"
        className="page-settings-drawer-content top-12 h-[calc(100%-48px)]"
      >
        <Drawer.Dialog
          className={`page-settings-drawer flag-emoji flex h-full ${widthClass} max-w-none flex-col overflow-hidden p-0`}
        >
          <Drawer.Header className="border-b border-separator/70 px-4 py-3">
            <Drawer.Heading className="text-base font-semibold">{title}</Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="no-scrollbar flex-1 overflow-y-auto px-4 py-3">
            {children}
          </Drawer.Body>
          <Drawer.CloseTrigger aria-label={tr('Close')} className="app-nodrag" />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

export default PageSettingsDrawer
