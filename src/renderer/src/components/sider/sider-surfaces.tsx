import { Button, cn, Tooltip, type ButtonProps } from '@heroui/react'
import type React from 'react'
import { LuChevronRight } from 'react-icons/lu'

type SiderStatusTone = 'default' | 'success' | 'warning' | 'danger'

interface SiderNavItemProps {
  icon: React.ReactNode
  title: string
  description?: React.ReactNode
  status?: React.ReactNode
  statusTone?: SiderStatusTone
  active?: boolean
  trailing?: React.ReactNode
  onPress: () => void
}

interface SiderStatusCardProps extends SiderNavItemProps {
  actions?: React.ReactNode
  descriptionTitle?: string
  statusTitle?: string
  details?: React.ReactNode
  metadataSeparator?: React.ReactNode
  prioritizeDescription?: boolean
  showChevron?: boolean
}

const statusToneClasses: Record<SiderStatusTone, string> = {
  default: 'text-foreground-500',
  success: 'text-success-600 dark:text-success-400',
  warning: 'text-warning-600 dark:text-warning-400',
  danger: 'text-danger-600 dark:text-danger-400'
}

const navigationStatusIndicatorClasses: Record<SiderStatusTone, string> = {
  default: 'bg-foreground-300',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500'
}

interface SiderIconButtonProps {
  active?: boolean
  children: React.ReactNode
  className?: string
  isDisabled?: boolean
  isPending?: boolean
  label: string
  onPress: NonNullable<ButtonProps['onPress']>
  placement?: 'top' | 'right' | 'bottom' | 'left'
  tooltip?: React.ReactNode
  variant?: ButtonProps['variant']
}

export const SiderIconButton: React.FC<SiderIconButtonProps> = ({
  active = false,
  children,
  className,
  isDisabled,
  isPending,
  label,
  onPress,
  placement = 'top',
  tooltip,
  variant = 'ghost'
}) => (
  <Tooltip delay={0}>
    <Tooltip.Trigger className="inline-flex">
      <Button
        aria-current={active ? 'page' : undefined}
        aria-label={label}
        className={className}
        isDisabled={isDisabled}
        isIconOnly
        isPending={isPending}
        size="sm"
        variant={active ? 'primary' : variant}
        onPress={onPress}
      >
        {children}
      </Button>
    </Tooltip.Trigger>
    <Tooltip.Content placement={placement}>{tooltip ?? label}</Tooltip.Content>
  </Tooltip>
)

export const SiderSection: React.FC<{
  title: string
  children: React.ReactNode
  columns?: 1 | 2
}> = ({ title, children, columns = 1 }) => (
  <section className="sider-section">
    <h2 className="mb-1 px-1 text-xs font-semibold text-foreground-500">{title}</h2>
    <div className={columns === 2 ? 'grid grid-cols-2 gap-1.5' : 'flex flex-col gap-1.5'}>
      {children}
    </div>
  </section>
)

export const SiderNavItem: React.FC<SiderNavItemProps> = ({
  icon,
  title,
  description,
  status,
  statusTone = 'default',
  active = false,
  trailing,
  onPress
}) => (
  <div
    className={cn(
      'group flex items-center rounded-xl border border-transparent transition-colors',
      active ? 'bg-primary/12 text-primary' : 'hover:bg-default-100'
    )}
  >
    <button
      type="button"
      data-card-primary-action
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      aria-current={active ? 'page' : undefined}
      onClick={onPress}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg bg-default-100/60 text-base text-foreground-500 transition-colors',
          active && 'bg-primary/12 text-primary'
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm font-medium text-foreground',
            active && 'text-primary'
          )}
          title={title}
        >
          {title}
        </span>
        {(description || status) && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs">
            {description && <span className="truncate text-foreground-500">{description}</span>}
            {description && status && <span className="text-foreground-300">·</span>}
            {status && (
              <span className="inline-flex shrink-0 items-center gap-1 text-foreground-500">
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1.5 rounded-full',
                    navigationStatusIndicatorClasses[statusTone]
                  )}
                />
                {status}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
    {trailing ? (
      <div className="shrink-0 pr-2" onPointerDown={(event) => event.stopPropagation()}>
        {trailing}
      </div>
    ) : (
      <LuChevronRight className="mr-2.5 shrink-0 text-sm text-foreground-200 transition-all group-hover:translate-x-0.5 group-hover:text-foreground-500 group-focus-within:text-foreground-500" />
    )}
  </div>
)

export const SiderStatusCard: React.FC<SiderStatusCardProps> = ({
  icon,
  title,
  description,
  status,
  statusTone = 'default',
  active = false,
  actions,
  descriptionTitle,
  statusTitle,
  details,
  metadataSeparator = '·',
  prioritizeDescription = false,
  showChevron,
  onPress
}) => (
  <div
    className={cn(
      'group overflow-hidden rounded-xl border border-divider bg-content1/85 shadow-none transition-colors',
      active ? 'border-primary/35 bg-primary/8' : 'hover:border-default-300 hover:bg-default-50'
    )}
  >
    <div className="flex min-h-14 items-center">
      <button
        type="button"
        data-card-primary-action
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
        aria-current={active ? 'page' : undefined}
        onClick={onPress}
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg bg-default-100 text-xl text-foreground-600 transition-colors',
            active && 'bg-primary/15 text-primary'
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground" title={title}>
            {title}
          </span>
          {(description || status) && (
            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs">
              {description && (
                <span
                  title={descriptionTitle}
                  className={cn(
                    'truncate text-foreground-500',
                    prioritizeDescription && 'max-w-[60%] shrink-0'
                  )}
                >
                  {description}
                </span>
              )}
              {description && status && (
                <span className="text-foreground-300">{metadataSeparator}</span>
              )}
              {status && (
                <span
                  title={statusTitle}
                  className={cn(
                    prioritizeDescription ? 'min-w-0 truncate' : 'shrink-0',
                    statusToneClasses[statusTone]
                  )}
                >
                  {status}
                </span>
              )}
            </span>
          )}
        </span>
        {(showChevron ?? !actions) && (
          <LuChevronRight className="shrink-0 text-sm text-foreground-300 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground-500" />
        )}
      </button>
      {actions && (
        <div
          className="flex shrink-0 items-center gap-0.5 pr-2"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
    {details && <div className="border-t border-divider/70 px-2.5 py-2">{details}</div>}
  </div>
)

interface SiderQuickControlProps {
  icon: React.ReactNode
  title: string
  status: string
  enabled: boolean
  disabled?: boolean
  active?: boolean
  control: React.ReactNode
  onPress: () => void
}

export const SiderQuickControl: React.FC<SiderQuickControlProps> = ({
  icon,
  title,
  status,
  enabled,
  disabled = false,
  active = false,
  control,
  onPress
}) => (
  <div
    className={cn(
      'relative min-h-20 rounded-2xl border border-divider bg-content1 px-2.5 py-2 shadow-sm transition-colors',
      active && 'border-primary/35 bg-primary/8',
      disabled && 'opacity-60'
    )}
  >
    <button
      type="button"
      data-card-primary-action
      aria-label={title}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full min-w-0 flex-col items-start rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        active && 'text-primary'
      )}
      onClick={onPress}
    >
      <span
        className={cn(
          'flex size-8 items-center justify-center text-xl text-foreground-600',
          active && 'text-primary'
        )}
      >
        {icon}
      </span>
      <span className="mt-1 block w-full truncate text-sm font-semibold text-foreground">
        {title}
      </span>
      <span
        className={cn(
          'mt-0.5 block w-full truncate whitespace-nowrap text-xs',
          enabled ? 'text-success-600 dark:text-success-400' : 'text-foreground-500'
        )}
      >
        {status}
      </span>
    </button>
    <div className="absolute right-2.5 top-2" onPointerDown={(event) => event.stopPropagation()}>
      {control}
    </div>
  </div>
)
