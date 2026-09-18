import { cn, Divider } from '@heroui/react'

import React, { createContext, useContext } from 'react'

const SettingItemLegacyContext = createContext(true)

export const SettingItemModeProvider = SettingItemLegacyContext.Provider

export interface SettingItemProps {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  divider?: boolean
  compatKey?: string
  align?: 'start' | 'center'
  variant?: 'default' | 'compact'
  contentAlign?: 'start' | 'end'
}

const SettingItem: React.FC<SettingItemProps> = (props) => {
  const {
    title,
    description,
    actions,
    children,
    divider = false,
    compatKey,
    align = 'center',
    variant = 'default',
    contentAlign = 'start'
  } = props
  const legacyMode = useContext(SettingItemLegacyContext)
  const isCompact = variant === 'compact'
  const hasTitle = title !== null && title !== undefined && title !== false
  const isTitleless = !hasTitle && !actions
  const searchableLabel = typeof title === 'string' ? title : undefined

  return (
    <>
      {compatKey && legacyMode ? (
        <div
          className="setting-item-legacy select-text h-8 w-full flex justify-between"
          data-setting-label={searchableLabel}
          tabIndex={searchableLabel ? -1 : undefined}
        >
          <div className="h-full flex items-center">
            <h4 className="h-full text-md leading-8 whitespace-nowrap">{title}</h4>
            <div>{actions}</div>
          </div>
          {children}
        </div>
      ) : (
        <div
          className={cn(
            'setting-item select-text',
            align === 'start' ? 'setting-item--start' : 'setting-item--center',
            isCompact && 'setting-item--compact',
            isTitleless && 'setting-item--titleless',
            description && 'setting-item--described',
            contentAlign === 'end' && 'setting-item--content-end'
          )}
          data-setting-label={searchableLabel}
          tabIndex={searchableLabel ? -1 : undefined}
        >
          {(hasTitle || actions) && (
            <div className="setting-item__title-wrap">
              {hasTitle &&
                (description ? (
                  <div className="setting-item__label-group">
                    <h4 className="setting-item__title">{title}</h4>
                    <p className="setting-item__description">{description}</p>
                  </div>
                ) : (
                  <h4 className="setting-item__title">{title}</h4>
                ))}
              {actions}
            </div>
          )}
          <div className="setting-item__content">{children}</div>
        </div>
      )}
      {divider && <Divider className="setting-item__divider my-2" />}
    </>
  )
}

export default SettingItem
