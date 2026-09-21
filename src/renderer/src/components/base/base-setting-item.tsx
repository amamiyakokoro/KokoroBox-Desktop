import { cn, Separator } from '@heroui/react'

import React from 'react'
import SettingHelp from './base-setting-help'

export interface SettingItemProps {
  title: React.ReactNode
  description?: React.ReactNode
  help?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  divider?: boolean
  align?: 'start' | 'center'
  variant?: 'default' | 'compact'
  contentAlign?: 'start' | 'end'
  rootRef?: React.Ref<HTMLDivElement>
  rootStyle?: React.CSSProperties
  rootClassName?: string
}

const SettingItem: React.FC<SettingItemProps> = (props) => {
  const {
    title,
    description,
    help,
    actions,
    children,
    divider = false,
    align = 'center',
    variant = 'default',
    contentAlign = 'start',
    rootRef,
    rootStyle,
    rootClassName
  } = props
  const isCompact = variant === 'compact'
  const hasTitle = title !== null && title !== undefined && title !== false
  const isTitleless = !hasTitle && !help && !actions
  const searchableLabel = typeof title === 'string' ? title : undefined

  return (
    <>
      <div
        ref={rootRef}
        style={rootStyle}
        className={cn(
          'setting-item select-text',
          align === 'start' ? 'setting-item--start' : 'setting-item--center',
          isCompact && 'setting-item--compact',
          isTitleless && 'setting-item--titleless',
          description && 'setting-item--described',
          contentAlign === 'end' && 'setting-item--content-end',
          rootClassName
        )}
        data-setting-label={searchableLabel}
        tabIndex={searchableLabel ? -1 : undefined}
      >
        {(hasTitle || help || actions) && (
          <div className="setting-item__title-wrap">
            {hasTitle && (
              <div className="setting-item__label-group">
                <div className="setting-item__title-line">
                  <h4 className="setting-item__title">{title}</h4>
                  {help && <SettingHelp>{help}</SettingHelp>}
                </div>
                {description && <p className="setting-item__description">{description}</p>}
              </div>
            )}
            {!hasTitle && help && <SettingHelp>{help}</SettingHelp>}
            {actions}
          </div>
        )}
        <div className="setting-item__content">{children}</div>
      </div>
      {divider && <Separator className="setting-item__divider my-2" variant="tertiary" />}
    </>
  )
}

export default SettingItem
