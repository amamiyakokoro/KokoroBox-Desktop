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

const siderItemTitleClassName = 'block truncate text-sm font-semibold leading-5 text-foreground'
const siderItemSubtitleClassName =
  'flex h-4 min-w-0 items-center gap-1 overflow-hidden text-xs leading-4'

const SiderItemIcon: React.FC<{
  active: boolean
  children: React.ReactNode
  prominence: 'navigation' | 'status'
}> = ({ active, children, prominence }) => (
  <span
    className={cn(
      'flex size-8 shrink-0 items-center justify-center rounded-lg bg-default-100/70 text-foreground-500 transition-colors duration-150 group-hover:bg-default-200/80 group-hover:text-foreground',
      prominence === 'navigation' ? 'text-base' : 'text-xl',
      active && 'bg-primary/15 text-primary group-hover:bg-primary/20 group-hover:text-primary'
    )}
  >
    {children}
  </span>
)

const SiderItemContent: React.FC<{
  active: boolean
  subtitle?: React.ReactNode
  title: string
}> = ({ active, subtitle, title }) => (
  <span className="flex min-h-[2.375rem] min-w-0 flex-1 flex-col justify-center gap-0.5">
    <span className={cn(siderItemTitleClassName, active && 'text-primary')} title={title}>
      {title}
    </span>
    {subtitle ? <span className={siderItemSubtitleClassName}>{subtitle}</span> : null}
  </span>
)

const SiderTrailingSlot: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div {...props} className={cn('flex min-w-8 shrink-0 items-center justify-center', className)}>
    {children}
  </div>
)

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
      'group flex items-center rounded-xl border transition-[background-color,border-color,box-shadow,color] duration-150',
      active
        ? 'border-primary/40 bg-primary/12 text-primary ring-1 ring-inset ring-primary/15 hover:bg-primary/16'
        : 'border-transparent hover:border-default-300 hover:bg-content2/80'
    )}
  >
    <button
      type="button"
      data-card-primary-action
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      aria-current={active ? 'page' : undefined}
      onClick={onPress}
    >
      <SiderItemIcon active={active} prominence="navigation">
        {icon}
      </SiderItemIcon>
      <SiderItemContent
        active={active}
        title={title}
        subtitle={
          description || status ? (
            <>
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
            </>
          ) : undefined
        }
      />
      {!trailing && (
        <SiderTrailingSlot>
          <LuChevronRight className="shrink-0 text-sm text-foreground-300 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-foreground-700 group-focus-within:text-primary" />
        </SiderTrailingSlot>
      )}
    </button>
    {trailing && (
      <SiderTrailingSlot className="pr-1.5" onPointerDown={(event) => event.stopPropagation()}>
        {trailing}
      </SiderTrailingSlot>
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
      'group overflow-hidden rounded-xl border bg-content1/85 shadow-none transition-[background-color,border-color,box-shadow] duration-150',
      active
        ? 'border-primary/45 bg-primary/10 ring-1 ring-inset ring-primary/15 hover:bg-primary/14'
        : 'border-divider hover:border-default-400/80 hover:bg-content2/70 hover:shadow-sm'
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
        <SiderItemIcon active={active} prominence="status">
          {icon}
        </SiderItemIcon>
        <SiderItemContent
          active={active}
          title={title}
          subtitle={
            description || status ? (
              <>
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
              </>
            ) : undefined
          }
        />
        {(showChevron ?? !actions) && (
          <SiderTrailingSlot>
            <LuChevronRight className="shrink-0 text-sm text-foreground-300 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-foreground-700 group-focus-within:text-primary" />
          </SiderTrailingSlot>
        )}
      </button>
      {actions && (
        <SiderTrailingSlot
          className="gap-0.5 pr-2"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {actions}
        </SiderTrailingSlot>
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
      'group relative min-h-20 rounded-2xl border border-divider bg-content1 px-2.5 py-2 shadow-sm transition-[background-color,border-color,box-shadow] duration-150 hover:border-default-400/80 hover:bg-content2/70 hover:shadow-md',
      active &&
        'border-primary/45 bg-primary/10 ring-1 ring-inset ring-primary/15 hover:bg-primary/14',
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
          'flex size-8 items-center justify-center text-xl text-foreground-600 transition-colors duration-150 group-hover:text-foreground',
          active && 'text-primary group-hover:text-primary'
        )}
      >
        {icon}
      </span>
      <span className="mt-1 flex w-full min-w-0 flex-col gap-0.5">
        <span className={cn(siderItemTitleClassName, active && 'text-primary')} title={title}>
          {title}
        </span>
        <span
          className={cn(
            'block h-4 w-full truncate whitespace-nowrap text-xs leading-4',
            enabled ? 'text-success-600 dark:text-success-400' : 'text-foreground-500'
          )}
        >
          {status}
        </span>
      </span>
    </button>
    <div className="absolute right-2.5 top-2" onPointerDown={(event) => event.stopPropagation()}>
      {control}
    </div>
  </div>
)
