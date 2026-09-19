import { Dropdown, cn } from '@heroui-v3/react'
import { buttonVariants } from '@heroui-v3/styles'
import type React from 'react'
import { resolveKokoButtonVariant, type KokoButtonProps } from './koko-form'

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
  buttonColor?: KokoButtonProps['color']
  buttonFullWidth?: boolean
  buttonVariant?: KokoButtonProps['variant']
  children: React.ReactNode
  isDisabled?: boolean
  isIconOnly?: boolean
  items: KokoActionMenuItem[]
  onAction: (id: string) => void | Promise<void>
  placement?: React.ComponentProps<typeof Dropdown.Popover>['placement']
  popoverClassName?: string
  size?: KokoButtonProps['size']
  triggerClassName?: string
}

export const KokoActionMenu: React.FC<KokoActionMenuProps> = ({
  ariaLabel,
  buttonClassName,
  buttonColor = 'default',
  buttonFullWidth = false,
  buttonVariant = 'light',
  children,
  isDisabled,
  isIconOnly = true,
  items,
  onAction,
  placement = 'bottom end',
  popoverClassName,
  size = 'sm',
  triggerClassName
}) => {
  const resolvedVariant = resolveKokoButtonVariant(buttonColor, buttonVariant)

  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={ariaLabel}
        className={cn(
          buttonVariants({
            fullWidth: buttonFullWidth,
            isIconOnly,
            size,
            variant: resolvedVariant
          }),
          buttonColor === 'primary' && buttonVariant === 'flat' && 'text-primary',
          buttonClassName,
          triggerClassName
        )}
        isDisabled={isDisabled}
      >
        {children}
      </Dropdown.Trigger>
      <Dropdown.Popover
        placement={placement}
        className={cn('min-w-40 rounded-lg', popoverClassName)}
      >
        <Dropdown.Menu
          aria-label={ariaLabel}
          className="p-1 text-sm"
          onAction={(key) => void onAction(String(key))}
        >
          {items.map((item) => (
            <Dropdown.Item
              id={item.id}
              key={item.id}
              isDisabled={item.isDisabled}
              textValue={item.textValue}
              variant={item.tone === 'danger' ? 'danger' : 'default'}
              className={cn(
                'min-h-8 rounded-md px-2.5 py-1.5',
                item.dividerAfter && 'border-b border-divider'
              )}
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
