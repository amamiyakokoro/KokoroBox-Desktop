import { Button, cn, Tooltip, type ButtonProps } from '@heroui/react'
import type React from 'react'
import { LuChevronRight } from 'react-icons/lu'

type SiderStatusTone = 'default' | 'success' | 'warning' | 'danger'
type SiderItemProminence = 'navigation' | 'account'

interface SiderNavItemProps {
  icon: React.ReactNode
  title: string
  description?: React.ReactNode
  status?: React.ReactNode
  statusTone?: SiderStatusTone
  prominence?: SiderItemProminence
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
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger'
}

const navigationStatusTextClasses: Record<SiderStatusTone, string> = {
  default: 'text-foreground-500',
  success: 'text-foreground-500',
  warning: 'text-warning',
  danger: 'text-danger'
}

const siderItemTitleClassName =
  'block h-5 truncate text-sm font-semibold leading-5 text-foreground'
const siderItemSubtitleClassName =
  'flex h-4 min-w-0 items-center gap-1 overflow-hidden text-xs leading-4'

interface SiderStatusRowProps {
  children: React.ReactNode
  className?: string
  tone?: SiderStatusTone
}

export const SiderStatusRow: React.FC<SiderStatusRowProps> = ({
  children,
  className,
  tone = 'default'
}) => (
  <span
    className={cn(
      'inline-flex h-4 min-w-0 items-center gap-1.5 text-xs leading-4',
      navigationStatusTextClasses[tone],
      className
    )}
    data-status-tone={tone}
  >
    <span
      aria-hidden="true"
      className={cn('size-1.5 shrink-0 rounded-full', navigationStatusIndicatorClasses[tone])}
    />
    <span className="min-w-0 truncate">{children}</span>
  </span>
)

const SiderItemIcon: React.FC<{
  active: boolean
  children: React.ReactNode
  prominence: SiderItemProminence | 'status'
}> = ({ active, children, prominence }) => (
  <span
    className={cn(
      'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150',
      prominence === 'navigation'
        ? 'bg-transparent text-base text-foreground-500 group-hover:bg-default-100/70 group-hover:text-foreground'
        : prominence === 'account'
          ? 'bg-accent-soft/35 text-lg text-accent-soft-foreground group-hover:bg-accent-soft/65 group-hover:text-accent-soft-foreground'
          : 'bg-default-100/70 text-xl text-foreground-500 group-hover:bg-default-200/80 group-hover:text-foreground',
      active &&
        (prominence !== 'status'
          ? 'bg-accent-soft text-accent-soft-foreground group-hover:bg-accent-soft group-hover:text-accent-soft-foreground'
          : 'bg-primary/15 text-primary group-hover:bg-primary/20 group-hover:text-primary')
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
  <span
    className="flex h-[2.375rem] min-w-0 flex-1 flex-col justify-center gap-0.5"
    data-sider-text-stack
  >
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
        className={cn('app-nodrag', className)}
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

export const SiderIconGroup: React.FC<{
  children: React.ReactNode
  label: string
  separated?: boolean
}> = ({ children, label, separated = false }) => (
  <div
    aria-label={label}
    className={cn(
      'flex w-full flex-col items-center gap-1.5 py-0.5',
      separated && 'mt-1.5 border-t border-separator/60 pt-2'
    )}
    data-sider-icon-group
    role="group"
  >
    {children}
  </div>
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
  prominence = 'navigation',
  active = false,
  trailing,
  onPress
}) => (
  <div
    data-prominence={prominence}
    className={cn(
      'group flex items-center rounded-xl border transition-[background-color,border-color,box-shadow,color] duration-150',
      active
        ? 'border-accent/45 bg-accent-soft/45 text-accent-soft-foreground ring-1 ring-inset ring-accent/15 hover:border-accent/55 hover:bg-accent-soft/65'
        : prominence === 'account'
          ? 'border-accent/20 bg-accent-soft/15 hover:border-accent/35 hover:bg-accent-soft/30 hover:shadow-sm'
          : 'border-separator/60 bg-surface/55 hover:border-accent/25 hover:bg-surface-secondary/70 hover:shadow-sm'
    )}
  >
    <button
      type="button"
      data-card-primary-action
      className={cn(
        'grid min-w-0 flex-1 items-center gap-x-2.5 rounded-xl px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
        trailing
          ? 'grid-cols-[2rem_minmax(0,1fr)]'
          : 'grid-cols-[2rem_minmax(0,1fr)_2rem]'
      )}
      aria-current={active ? 'page' : undefined}
      onClick={onPress}
    >
      <SiderItemIcon active={active} prominence={prominence}>
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
                <SiderStatusRow className="shrink-0" tone={statusTone}>
                  {status}
                </SiderStatusRow>
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
  <div data-sider-quick-control className="sider-quick-control-container w-full min-w-0">
    <div
      className={cn(
        'sider-quick-control group rounded-2xl border border-divider bg-content1 px-2.5 py-2 shadow-sm transition-[background-color,border-color,box-shadow] duration-150 hover:border-default-400/80 hover:bg-content2/70 hover:shadow-md',
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
          'sider-quick-control__primary min-w-0 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          active && 'text-primary'
        )}
        onClick={onPress}
      >
        <span
          className={cn(
            'sider-quick-control__icon flex size-8 items-center justify-center text-xl text-foreground-600 transition-colors duration-150 group-hover:text-foreground',
            active && 'text-primary group-hover:text-primary'
          )}
        >
          {icon}
        </span>
        <span
          className={cn(
            'sider-quick-control__title whitespace-nowrap',
            siderItemTitleClassName,
            active && 'text-primary'
          )}
          title={title}
        >
          {title}
        </span>
        <SiderStatusRow
          className="sider-quick-control__status w-full"
          tone={enabled ? 'success' : 'default'}
        >
          {status}
        </SiderStatusRow>
      </button>
      <div
        data-sider-control-slot
        className="sider-quick-control__control flex min-w-10 items-center justify-center"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {control}
      </div>
    </div>
  </div>
)
