import { Button, Dropdown, cn, type ButtonProps } from '@heroui-v3/react'
import type React from 'react'

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
          {items.map((item) => (
            <Dropdown.Item
              id={item.id}
              key={item.id}
              isDisabled={item.isDisabled}
              textValue={item.textValue}
              variant={item.tone === 'danger' ? 'danger' : 'default'}
              className={cn(item.dividerAfter && 'border-b border-divider')}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.startContent ? <span className="shrink-0">{item.startContent}</span> : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.description ? (
                    <span className="mt-0.5 block truncate text-xs text-foreground-500">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </span>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
