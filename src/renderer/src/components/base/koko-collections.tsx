import {
  Button,
  Description,
  Dropdown,
  Label,
  Separator,
  type ButtonProps
} from '@heroui/react'
import React from 'react'

export interface KokoActionMenuItem {
  id: string
  label: React.ReactNode
  textValue: string
  description?: React.ReactNode
  dividerAfter?: boolean
  isDisabled?: boolean
  startContent?: React.ReactNode
  tone?: 'default' | 'danger'
}

interface KokoActionMenuProps {
  ariaLabel: string
  buttonClassName?: string
  buttonFullWidth?: boolean
  buttonVariant?: ButtonProps['variant']
  children: React.ReactNode
  isDisabled?: boolean
  isIconOnly?: boolean
  items: KokoActionMenuItem[]
  onAction: (id: string) => void | Promise<void>
  placement?: React.ComponentProps<typeof Dropdown.Popover>['placement']
  popoverClassName?: string
  size?: ButtonProps['size']
}

const groupActionMenuItems = (items: KokoActionMenuItem[]): KokoActionMenuItem[][] => {
  const sections: KokoActionMenuItem[][] = []
  let currentSection: KokoActionMenuItem[] = []

  items.forEach((item, index) => {
    const previousItem = currentSection.at(-1)
    const changesDangerGroup =
      previousItem && (previousItem.tone === 'danger') !== (item.tone === 'danger')

    if (changesDangerGroup) {
      sections.push(currentSection)
      currentSection = []
    }

    currentSection.push(item)

    if (item.dividerAfter && index < items.length - 1) {
      sections.push(currentSection)
      currentSection = []
    }
  })

  if (currentSection.length > 0) sections.push(currentSection)
  return sections
}

export const KokoActionMenu: React.FC<KokoActionMenuProps> = ({
  ariaLabel,
  buttonClassName,
  buttonFullWidth = false,
  buttonVariant = 'ghost',
  children,
  isDisabled,
  isIconOnly = true,
  items,
  onAction,
  placement = 'bottom end',
  popoverClassName,
  size = 'sm'
}) => {
  const sections = groupActionMenuItems(items)

  return (
    <Dropdown>
      <Button
        aria-label={ariaLabel}
        className={buttonClassName}
        fullWidth={buttonFullWidth}
        isDisabled={isDisabled}
        isIconOnly={isIconOnly}
        size={size}
        variant={buttonVariant}
      >
        {children}
      </Button>
      <Dropdown.Popover placement={placement} className={popoverClassName}>
        <Dropdown.Menu aria-label={ariaLabel} onAction={(key) => void onAction(String(key))}>
          {sections.map((section, sectionIndex) => (
            <React.Fragment key={section.map((item) => item.id).join(':')}>
              {sectionIndex > 0 ? <Separator /> : null}
              <Dropdown.Section>
                {section.map((item) => (
                  <Dropdown.Item
                    id={item.id}
                    key={item.id}
                    isDisabled={item.isDisabled}
                    textValue={item.textValue}
                    variant={item.tone === 'danger' ? 'danger' : 'default'}
                  >
                    {item.startContent ? (
                      <span aria-hidden="true" className="shrink-0 text-muted [&>svg]:size-4">
                        {item.startContent}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <Label className="block truncate">{item.label}</Label>
                      {item.description ? (
                        <Description className="block truncate">{item.description}</Description>
                      ) : null}
                    </span>
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
            </React.Fragment>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
