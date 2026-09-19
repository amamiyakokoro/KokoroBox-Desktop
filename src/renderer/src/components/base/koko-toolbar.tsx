import { Button, Tooltip, cn, type ButtonProps } from '@heroui/react'
import type React from 'react'

interface KokoToolbarProps {
  children: React.ReactNode
  className?: string
  'aria-label'?: string
}

export const KokoToolbar: React.FC<KokoToolbarProps> = ({
  children,
  className,
  'aria-label': ariaLabel
}) => (
  <div
    aria-label={ariaLabel}
    className={cn('flex min-h-13 w-full items-center gap-2 px-2 py-2', className)}
    role={ariaLabel ? 'toolbar' : undefined}
  >
    {children}
  </div>
)

interface KokoToolbarIconButtonProps {
  children: React.ReactNode
  className?: string
  isActive?: boolean
  isDisabled?: boolean
  label: string
  onPress: NonNullable<ButtonProps['onPress']>
  tone?: 'default' | 'danger'
}

export const KokoToolbarIconButton: React.FC<KokoToolbarIconButtonProps> = ({
  children,
  className,
  isActive,
  isDisabled,
  label,
  onPress,
  tone = 'default'
}) => (
  <Tooltip delay={0}>
    <Tooltip.Trigger>
      <Button
        aria-label={label}
        aria-pressed={tone === 'default' && typeof isActive === 'boolean' ? isActive : undefined}
        className={cn('h-9 w-9 min-w-9 shrink-0', className)}
        isDisabled={isDisabled}
        isIconOnly
        size="sm"
        variant={tone === 'danger' ? 'danger-soft' : isActive ? 'primary' : 'ghost'}
        onPress={onPress}
      >
        {children}
      </Button>
    </Tooltip.Trigger>
    <Tooltip.Content>{label}</Tooltip.Content>
  </Tooltip>
)
