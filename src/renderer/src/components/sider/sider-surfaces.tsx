import { Button, cn, ToggleButton, Tooltip, type ButtonProps } from '@heroui/react'
import {
  KokoStatusIndicator,
  type KokoStatusTone
} from '@renderer/components/base/koko-status-indicator'
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

interface SiderStatusCardProps extends Omit<SiderNavItemProps, 'onPress'> {
  actions?: React.ReactNode
  allowTextWrap?: boolean
  descriptionTitle?: string
  statusTitle?: string
  details?: React.ReactNode
  metadata?: React.ReactNode
  metadataSeparator?: React.ReactNode
  prioritizeDescription?: boolean
  showChevron?: boolean
  statusIndicator?: boolean
  stackStatus?: boolean
  onPress?: () => void
}

const statusToneClasses: Record<SiderStatusTone, string> = {
  default: 'text-muted',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger'
}

const kokoStatusTone = (tone: SiderStatusTone): KokoStatusTone =>
  tone === 'default' ? 'neutral' : tone

const siderItemTitleClassName = 'block min-w-0 text-sm font-semibold leading-5 text-foreground'
const siderItemSubtitleClassName =
  'flex h-4 min-w-0 items-center gap-1 overflow-hidden text-xs leading-4'
const siderActiveSurfaceClassName =
  'border-accent/45 bg-accent-soft/40 ring-1 ring-inset ring-accent/15 hover:border-accent/55 hover:bg-accent-soft/60'
const siderActiveIconClassName =
  'bg-accent-soft text-accent-soft-foreground group-hover:bg-accent-soft/80 group-hover:text-accent-soft-foreground'
const siderActiveIconButtonClassName =
  'border border-accent/45 bg-accent-soft/55 text-accent-soft-foreground ring-1 ring-inset ring-accent/15 hover:border-accent/55 hover:bg-accent-soft/75'

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
  <KokoStatusIndicator className={className} tone={kokoStatusTone(tone)}>
    {children}
  </KokoStatusIndicator>
)

const SiderItemIcon: React.FC<{
  active: boolean
  children: React.ReactNode
  className?: string
  prominence: SiderItemProminence | 'status'
}> = ({ active, children, className, prominence }) => (
  <span
    className={cn(
      'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150',
      !active &&
        (prominence === 'navigation'
          ? 'bg-transparent text-base text-muted group-hover:bg-surface-secondary/70 group-hover:text-foreground'
          : prominence === 'account'
            ? 'bg-accent-soft/35 text-lg text-accent-soft-foreground group-hover:bg-accent-soft/65 group-hover:text-accent-soft-foreground'
            : 'bg-surface-secondary/70 text-xl text-muted group-hover:bg-surface-secondary/80 group-hover:text-foreground'),
      active && siderActiveIconClassName,
      className
    )}
  >
    {children}
  </span>
)

const SiderItemContent: React.FC<{
  allowTextWrap?: boolean
  stackStatus?: boolean
  subtitle?: React.ReactNode
  title: string
}> = ({ allowTextWrap = false, stackStatus = false, subtitle, title }) => (
  <span
    className={cn(
      'flex min-w-0 flex-1 flex-col justify-center gap-0.5',
      allowTextWrap ? 'min-h-[2.375rem] py-0.5' : 'h-[2.375rem]'
    )}
    data-sider-text-stack
  >
    <span
      className={cn(
        siderItemTitleClassName,
        allowTextWrap ? 'line-clamp-2 break-words' : 'h-5 truncate'
      )}
      title={title}
    >
      {title}
    </span>
    {subtitle ? (
      <span
        className={cn(
          siderItemSubtitleClassName,
          allowTextWrap && 'h-auto min-h-4 flex-wrap overflow-visible',
          stackStatus && 'flex-col items-start gap-1'
        )}
      >
        {subtitle}
      </span>
    ) : null}
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
  onFocus?: ButtonProps['onFocus']
  onPointerEnter?: ButtonProps['onPointerEnter']
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
  onFocus,
  onPointerEnter,
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
        className={cn('app-nodrag', className, active && siderActiveIconButtonClassName)}
        isDisabled={isDisabled}
        isIconOnly
        isPending={isPending}
        size="sm"
        variant={active ? 'secondary' : variant}
        onFocus={onFocus}
        onPointerEnter={onPointerEnter}
        onPress={onPress}
      >
        {children}
      </Button>
    </Tooltip.Trigger>
    <Tooltip.Content placement={placement}>{tooltip ?? label}</Tooltip.Content>
  </Tooltip>
)

interface SiderIconToggleButtonProps {
  children: React.ReactNode
  className?: string
  isDisabled?: boolean
  isSelected: boolean
  label: string
  onChange: (selected: boolean) => void | Promise<void>
  placement?: 'top' | 'right' | 'bottom' | 'left'
  tooltip?: React.ReactNode
}

export const SiderIconToggleButton: React.FC<SiderIconToggleButtonProps> = ({
  children,
  className,
  isDisabled,
  isSelected,
  label,
  onChange,
  placement = 'top',
  tooltip
}) => (
  <Tooltip delay={0}>
    <Tooltip.Trigger className="inline-flex">
      <ToggleButton
        aria-label={label}
        className={cn(
          'app-nodrag border border-transparent text-muted data-[selected=true]:border-accent/45 data-[selected=true]:bg-accent-soft/55 data-[selected=true]:text-accent-soft-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-accent/15',
          className
        )}
        isDisabled={isDisabled}
        isIconOnly
        isSelected={isSelected}
        size="sm"
        variant="ghost"
        onChange={(selected) => void onChange(selected)}
      >
        {children}
      </ToggleButton>
    </Tooltip.Trigger>
    <Tooltip.Content placement={placement}>{tooltip ?? label}</Tooltip.Content>
  </Tooltip>
)

export const SiderIconDisplay: React.FC<{
  children: React.ReactNode
  className?: string
  label: string
  placement?: 'top' | 'right' | 'bottom' | 'left'
}> = ({ children, className, label, placement = 'top' }) => (
  <Tooltip delay={0}>
    <Tooltip.Trigger className="inline-flex">
      <span
        aria-label={label}
        className={cn(
          'app-nodrag flex size-8 items-center justify-center rounded-xl bg-surface-secondary text-muted',
          className
        )}
        role="img"
      >
        {children}
      </span>
    </Tooltip.Trigger>
    <Tooltip.Content placement={placement}>{label}</Tooltip.Content>
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
    <h2 className="mb-1 px-1 text-xs font-semibold text-muted">{title}</h2>
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
        ? siderActiveSurfaceClassName
        : prominence === 'account'
          ? 'border-accent/20 bg-accent-soft/15 hover:border-accent/35 hover:bg-accent-soft/30 hover:shadow-sm'
          : 'border-separator/60 bg-surface/55 hover:border-accent/25 hover:bg-surface-secondary/70 hover:shadow-sm'
    )}
  >
    <button
      type="button"
      data-card-primary-action
      className={cn(
        'grid min-w-0 flex-1 items-center gap-x-2.5 rounded-xl px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent',
        trailing ? 'grid-cols-[2rem_minmax(0,1fr)]' : 'grid-cols-[2rem_minmax(0,1fr)_2rem]'
      )}
      aria-current={active ? 'page' : undefined}
      onClick={onPress}
    >
      <SiderItemIcon active={active} prominence={prominence}>
        {icon}
      </SiderItemIcon>
      <SiderItemContent
        title={title}
        subtitle={
          description || status ? (
            <>
              {description && <span className="truncate text-muted">{description}</span>}
              {description && status && <span className="text-muted">·</span>}
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
          <LuChevronRight className="shrink-0 text-sm text-muted transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-foreground group-focus-within:text-accent" />
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
  allowTextWrap = false,
  descriptionTitle,
  statusTitle,
  details,
  metadata,
  metadataSeparator = '·',
  prioritizeDescription = false,
  showChevron,
  statusIndicator = false,
  stackStatus = false,
  onPress
}) => {
  const primaryClassName = cn(
    'sider-status-card__primary min-w-0 flex-1 px-2.5 py-2 text-left',
    onPress &&
      'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent',
    metadata
      ? 'grid grid-cols-[2rem_minmax(0,1fr)_2rem] grid-rows-[1.25rem_1rem] items-center gap-x-2.5 gap-y-0.5'
      : 'flex items-center gap-2.5'
  )
  const primaryContent = (
    <>
      <SiderItemIcon
        active={active}
        className={metadata ? 'row-span-2 self-center' : undefined}
        prominence="status"
      >
        {icon}
      </SiderItemIcon>
      {metadata ? (
        <>
          <span className={cn(siderItemTitleClassName, 'h-5 truncate')} title={title}>
            {title}
          </span>
          <div className="col-[2/4] row-start-2 min-w-0">{metadata}</div>
        </>
      ) : (
        <SiderItemContent
          allowTextWrap={allowTextWrap}
          stackStatus={stackStatus}
          title={title}
          subtitle={
            description || status ? (
              <>
                {description && (
                  <span
                    title={descriptionTitle}
                    className={cn(
                      allowTextWrap ? 'whitespace-nowrap text-muted' : 'truncate text-muted',
                      prioritizeDescription && 'max-w-[60%] shrink-0'
                    )}
                  >
                    {description}
                  </span>
                )}
                {status && (
                  <span className="inline-flex shrink-0 items-center gap-1">
                    {description && !stackStatus && (
                      <span className="text-muted">{metadataSeparator}</span>
                    )}
                    {statusIndicator ? (
                      <KokoStatusIndicator
                        className={prioritizeDescription ? 'min-w-0' : 'shrink-0'}
                        title={statusTitle}
                        tone={kokoStatusTone(statusTone)}
                      >
                        {status}
                      </KokoStatusIndicator>
                    ) : (
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
              </>
            ) : undefined
          }
        />
      )}
      {(showChevron ?? !actions) && (
        <SiderTrailingSlot>
          <LuChevronRight className="shrink-0 text-sm text-muted transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-foreground group-focus-within:text-accent" />
        </SiderTrailingSlot>
      )}
    </>
  )

  return (
    <div
      className={cn(
        'group overflow-hidden rounded-xl border bg-surface/85 shadow-none transition-[background-color,border-color,box-shadow] duration-150',
        active
          ? siderActiveSurfaceClassName
          : onPress
            ? 'border-separator hover:border-accent/25 hover:bg-surface-secondary/70 hover:shadow-sm'
            : 'border-separator'
      )}
    >
      <div className="flex min-h-14 items-center">
        {onPress ? (
          <button
            type="button"
            data-card-primary-action
            className={primaryClassName}
            aria-current={active ? 'page' : undefined}
            onClick={onPress}
          >
            {primaryContent}
          </button>
        ) : (
          <div className={primaryClassName}>{primaryContent}</div>
        )}
        {actions && (
          <SiderTrailingSlot
            className="gap-0.5 pr-2"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {actions}
          </SiderTrailingSlot>
        )}
      </div>
      {details && <div className="border-t border-separator/70 px-2.5 py-2">{details}</div>}
    </div>
  )
}

interface SiderQuickControlProps {
  icon: React.ReactNode
  title: string
  status: string
  enabled: boolean
  disabled?: boolean
  isDragging?: boolean
  onToggle: (enabled: boolean) => void | Promise<void>
}

export const SiderQuickControl: React.FC<SiderQuickControlProps> = ({
  icon,
  title,
  status,
  enabled,
  disabled = false,
  isDragging = false,
  onToggle
}) => (
  <div data-sider-quick-control className="sider-quick-control-container w-full min-w-0">
    <ToggleButton
      data-card-primary-action
      aria-label={title}
      className={cn(
        'sider-quick-control app-nodrag group h-auto w-full min-w-0 justify-start rounded-2xl border px-2.5 py-2 text-left text-foreground shadow-sm transition-[background-color,border-color,box-shadow] duration-150 data-[selected=true]:text-foreground',
        disabled
          ? 'border-separator bg-surface-secondary opacity-60 shadow-none'
          : enabled
            ? 'border-accent/35 bg-accent-soft/20 hover:border-accent/45 hover:bg-accent-soft/30 hover:shadow-md'
            : 'border-separator bg-surface hover:border-accent/25 hover:bg-surface-secondary/70 hover:shadow-md'
      )}
      isDisabled={disabled}
      isSelected={enabled}
      variant="ghost"
      onChange={(selected) => {
        if (!isDragging) void onToggle(selected)
      }}
    >
      <SiderItemIcon active={enabled} className="sider-quick-control__icon" prominence="status">
        {icon}
      </SiderItemIcon>
      <span
        className={cn('sider-quick-control__title whitespace-nowrap', siderItemTitleClassName)}
        title={title}
      >
        {title}
      </span>
      <SiderStatusRow
        className="sider-quick-control__status min-w-0 text-xs"
        tone={enabled ? 'success' : 'danger'}
      >
        <span className="truncate">{status}</span>
      </SiderStatusRow>
    </ToggleButton>
  </div>
)
