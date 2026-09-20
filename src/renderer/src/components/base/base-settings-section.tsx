import { cn } from '@heroui/react'
import React, { type ReactNode } from 'react'

interface SettingsSectionProps {
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  description?: ReactNode
  settingLabel?: string
  title?: ReactNode
}

/** Shared flat section anatomy for Application Settings and feature settings. */
export const SettingsSection: React.FC<SettingsSectionProps> = ({
  action,
  children,
  className,
  contentClassName,
  description,
  settingLabel,
  title
}) => {
  const hasHeader = title || description || action

  return (
    <section
      className={cn('settings-section px-3 py-1.5 first:pt-1.5', className)}
      data-setting-label={settingLabel}
      tabIndex={settingLabel ? -1 : undefined}
    >
      {hasHeader ? (
        <header className="settings-section__header flex items-start gap-3 px-1 pb-1.5 pt-0.5">
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 className="settings-section__heading text-base font-semibold leading-6 text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs leading-4 text-muted">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div
        className={cn(
          'settings-section__content border-t border-separator px-1 py-0.5',
          contentClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}

export default SettingsSection
