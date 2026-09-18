import React, { createContext, useContext } from 'react'
import { Accordion, AccordionItem, Card, CardBody } from '@heroui/react'

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
        className={`${className || ''} settings-section px-3 py-3`}
        data-setting-label={header}
        tabIndex={header ? -1 : undefined}
      >
        {header && (
          <h2 className="px-1 pb-2 text-sm font-semibold tracking-wide text-foreground-500">
            {header}
          </h2>
        )}
        <div className="settings-section__content border-y border-divider px-1 py-2">
          {children}
        </div>
      </section>
    )
  }

  return !header ? (
    <Card className={`${className || ''} m-2`}>
      <CardBody>{children}</CardBody>
    </Card>
  ) : (
    <Accordion
      isCompact
      className={`${className || ''} my-2`}
      variant="splitted"
      data-setting-label={header}
      tabIndex={header ? -1 : undefined}
    >
      <AccordionItem
        aria-label={header}
        className="data-[open=true]:pb-2"
        keepContentMounted
        title={<span>{header}</span>}
        indicator={({ isOpen }) => (
          <svg
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      >
        {children}
      </AccordionItem>
    </Accordion>
  )
}

export default SettingCard
