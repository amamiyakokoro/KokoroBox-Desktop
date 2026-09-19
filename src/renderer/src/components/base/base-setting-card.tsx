import React, { createContext, useContext } from 'react'
import { Disclosure, Surface } from '@heroui/react'

interface Props {
  header?: string
  children?: React.ReactNode
  className?: string
}

const SettingCardCollapsibleContext = createContext(true)

export const SettingCardModeProvider = SettingCardCollapsibleContext.Provider

const SettingCard: React.FC<Props> = (props) => {
  const { header, children, className } = props
  const collapsible = useContext(SettingCardCollapsibleContext)

  if (!collapsible) {
    return (
      <section
        className={`${className || ''} settings-section px-3 py-2 first:pt-2`}
        data-setting-label={header}
        tabIndex={header ? -1 : undefined}
      >
        {header && (
          <h2 className="settings-section__heading px-1 pb-2 pt-1 text-base font-semibold leading-6 text-foreground">
            {header}
          </h2>
        )}
        <div className="settings-section__content border-t border-divider px-1 py-1">
          {children}
        </div>
      </section>
    )
  }

  return !header ? (
    <Surface
      variant="default"
      className={`${className || ''} m-2 rounded-xl border border-separator/70 p-3`}
    >
      {children}
    </Surface>
  ) : (
    <div
      className={`${className || ''} mx-2 my-2 overflow-hidden rounded-xl border border-separator/70 bg-surface`}
      data-setting-label={header}
      tabIndex={header ? -1 : undefined}
    >
      <Disclosure>
        <Disclosure.Heading>
          <Disclosure.Trigger className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-base font-medium text-foreground">
            <span className="min-w-0 flex-1 truncate">{header}</span>
            <Disclosure.Indicator className="text-foreground-500" />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <div className="border-t border-separator/70 px-3 py-2">{children}</div>
        </Disclosure.Content>
      </Disclosure>
    </div>
  )
}

export default SettingCard
