import {
  Button,
  InputGroup,
  Label,
  ListBox,
  Select,
  Switch,
  Tooltip,
  cn,
  type ButtonProps,
  type SelectProps
} from '@heroui/react'
import React from 'react'
import { LuX } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'

type KokoTextFieldClassNames = {
  input?: string
  inputWrapper?: string
}

interface KokoTextFieldProps extends Omit<
  React.ComponentProps<typeof InputGroup.Input>,
  'className' | 'disabled' | 'onChange' | 'size'
> {
  className?: string
  classNames?: KokoTextFieldClassNames
  endContent?: React.ReactNode
  isDisabled?: boolean
  isClearable?: boolean
  isInvalid?: boolean
  onClear?: () => void
  onValueChange?: (value: string) => void
  size?: 'sm' | 'md' | 'lg'
  startContent?: React.ReactNode
  'data-setting-input'?: string
}

export const KokoTextField: React.FC<KokoTextFieldProps> = ({
  className,
  classNames,
  endContent,
  isDisabled,
  isClearable,
  isInvalid,
  onClear,
  onValueChange,
  size = 'sm',
  startContent,
  value,
  'data-setting-input': dataSettingInput,
  ...inputProps
}) => (
  <InputGroup
    className={cn(
      size === 'sm' && 'min-h-8',
      size === 'lg' && 'min-h-10',
      isInvalid && 'ring-1 ring-danger',
      classNames?.inputWrapper,
      className
    )}
    data-invalid={isInvalid || undefined}
    data-setting-input={dataSettingInput}
    variant="secondary"
  >
    {startContent && <InputGroup.Prefix>{startContent}</InputGroup.Prefix>}
    <InputGroup.Input
      {...inputProps}
      aria-invalid={isInvalid || undefined}
      className={classNames?.input}
      disabled={isDisabled}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
    {(endContent || ((isClearable || onClear) && value)) && (
      <InputGroup.Suffix className="gap-1">
        {endContent}
        {(isClearable || onClear) && value ? (
          <Button
            aria-label={tr('Clear field')}
            className="h-6 w-6 min-w-6"
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={() => {
              onClear?.()
              if (!onClear) onValueChange?.('')
            }}
          >
            <LuX />
          </Button>
        ) : null}
      </InputGroup.Suffix>
    )}
  </InputGroup>
)

export interface KokoSelectOption {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  textValue?: string
  isDisabled?: boolean
}

interface KokoSelectBaseProps {
  'aria-label': string
  className?: string
  density?: 'normal' | 'compact'
  disallowEmptySelection?: boolean
  isDisabled?: boolean
  label?: React.ReactNode
  labelPlacement?: 'inside' | 'outside'
  options: KokoSelectOption[]
  placeholder?: string
  variant?: SelectProps<object>['variant']
}

interface KokoSingleSelectProps extends KokoSelectBaseProps {
  multiple?: false
  value: string
  onChange: (value: string) => void | Promise<void>
}

interface KokoMultipleSelectProps extends KokoSelectBaseProps {
  multiple: true
  value: string[]
  onChange: (value: string[]) => void | Promise<void>
}

export type KokoSelectProps = KokoSingleSelectProps | KokoMultipleSelectProps

const KokoSelectContent: React.FC<{
  density: 'normal' | 'compact'
  label?: React.ReactNode
  labelPlacement: 'inside' | 'outside'
  options: KokoSelectOption[]
  placeholder?: string
}> = ({ density, label, labelPlacement, options, placeholder }) => (
  <>
    {label ? (
      <Label
        className={cn(
          'text-xs text-foreground-500',
          labelPlacement === 'inside'
            ? 'pointer-events-none absolute start-3 top-1.5 z-10 max-w-[calc(100%-2.5rem)] truncate'
            : 'mb-1'
        )}
      >
        {label}
      </Label>
    ) : null}
    <Select.Trigger
      className={cn(
        labelPlacement === 'inside' && 'h-12 min-h-12 items-end pb-1.5 pt-5',
        labelPlacement === 'outside' && density === 'compact' && 'h-8 min-h-8 py-0'
      )}
    >
      <Select.Value className="min-w-0 truncate">
        {({ defaultChildren, isPlaceholder, selectedText }) =>
          isPlaceholder ? (placeholder ?? defaultChildren) : selectedText
        }
      </Select.Value>
      <Select.Indicator />
    </Select.Trigger>
    <Select.Popover
      className={cn(
        density === 'compact' ? 'w-max max-w-72' : 'max-w-[min(24rem,calc(100vw-2rem))]'
      )}
    >
      <ListBox>
        {options.map((option) => (
          <ListBox.Item
            id={option.id}
            key={option.id}
            className={cn(density === 'compact' && 'min-h-8 px-2 py-1')}
            isDisabled={option.isDisabled}
            textValue={
              option.textValue ?? (typeof option.label === 'string' ? option.label : option.id)
            }
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{option.label}</span>
              {option.description ? (
                <span className="mt-0.5 block truncate text-xs text-foreground-500">
                  {option.description}
                </span>
              ) : null}
            </span>
            <ListBox.ItemIndicator />
          </ListBox.Item>
        ))}
      </ListBox>
    </Select.Popover>
  </>
)

export const KokoSelect: React.FC<KokoSelectProps> = (props) => {
  const {
    className,
    density = 'normal',
    disallowEmptySelection = false,
    isDisabled,
    label,
    labelPlacement = 'outside',
    options,
    placeholder,
    variant = 'primary'
  } = props

  if (props.multiple) {
    return (
      <Select<object, 'multiple'>
        aria-label={props['aria-label']}
        className={cn(labelPlacement === 'inside' && 'relative', className)}
        isDisabled={isDisabled}
        selectionMode="multiple"
        value={props.value}
        variant={variant}
        onChange={(value) => {
          if (disallowEmptySelection && value.length === 0) return
          void props.onChange(value.map(String))
        }}
      >
        <KokoSelectContent
          density={density}
          label={label}
          labelPlacement={labelPlacement}
          options={options}
          placeholder={placeholder}
        />
      </Select>
    )
  }

  return (
    <Select
      aria-label={props['aria-label']}
      className={cn(labelPlacement === 'inside' && 'relative', className)}
      isDisabled={isDisabled}
      value={props.value}
      variant={variant}
      onChange={(value) => {
        if (value == null || Array.isArray(value)) return
        if (disallowEmptySelection && value === '') return
        void props.onChange(String(value))
      }}
    >
      <KokoSelectContent
        density={density}
        label={label}
        labelPlacement={labelPlacement}
        options={options}
        placeholder={placeholder}
      />
    </Select>
  )
}

interface KokoSwitchProps extends Omit<
  React.ComponentProps<typeof Switch>,
  'children' | 'onChange'
> {
  children?: React.ReactNode
  onValueChange?: (isSelected: boolean) => void
}

export const KokoSwitch: React.FC<KokoSwitchProps> = ({
  children,
  onValueChange,
  size = 'sm',
  ...props
}) => (
  <Switch {...props} size={size} onChange={onValueChange}>
    <Switch.Content>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      {children}
    </Switch.Content>
  </Switch>
)

type LegacyButtonColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
type LegacyButtonVariant = 'solid' | 'light' | 'flat' | 'bordered' | 'shadow'

export interface KokoButtonProps extends Omit<ButtonProps, 'variant'> {
  color?: LegacyButtonColor
  isLoading?: boolean
  title?: string
  variant?: ButtonProps['variant'] | LegacyButtonVariant
}

export function resolveKokoButtonVariant(
  color: LegacyButtonColor | undefined,
  variant: KokoButtonProps['variant']
): ButtonProps['variant'] {
  if (variant === 'primary' || variant === 'secondary' || variant === 'tertiary') return variant
  if (variant === 'outline' || variant === 'ghost' || variant === 'danger-soft') return variant
  if (variant === 'danger') return variant
  if (variant === 'bordered') return 'outline'
  if (variant === 'light') return 'ghost'
  if (variant === 'flat') return color === 'danger' ? 'danger-soft' : 'secondary'
  if (color === 'danger') return 'danger'
  if (
    color === 'primary' ||
    color === 'success' ||
    color === 'warning' ||
    variant === 'solid' ||
    variant === 'shadow'
  )
    return 'primary'
  return 'secondary'
}

export const KokoButton: React.FC<KokoButtonProps> = ({
  className,
  color,
  isLoading,
  isPending,
  variant,
  ...props
}) => (
  <Button
    {...props}
    className={cn(
      color === 'primary' && variant === 'flat' && 'text-primary',
      color === 'warning' &&
        (variant === 'flat' || variant === 'light' || variant === 'bordered'
          ? 'text-warning-700 dark:text-warning-400'
          : 'bg-warning text-warning-foreground'),
      color === 'success' &&
        (variant === 'flat' || variant === 'light' || variant === 'bordered'
          ? 'text-success-700 dark:text-success-400'
          : 'bg-success text-success-foreground'),
      className
    )}
    isPending={isLoading ?? isPending}
    variant={resolveKokoButtonVariant(color, variant)}
  />
)

interface KokoTooltipProps {
  children: React.ReactNode
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
  content: React.ReactNode
  isOpen?: boolean
  offset?: number
  placement?: 'top' | 'right' | 'bottom' | 'left'
  showArrow?: boolean
}

export const KokoTooltip: React.FC<KokoTooltipProps> = ({
  children,
  color,
  content,
  isOpen,
  offset,
  placement = 'top',
  showArrow
}) => (
  <Tooltip delay={0} isOpen={isOpen}>
    <Tooltip.Trigger className="inline-flex min-w-0">{children}</Tooltip.Trigger>
    <Tooltip.Content
      className={cn(color === 'danger' && 'bg-danger text-danger-foreground')}
      offset={offset}
      placement={placement}
      showArrow={showArrow}
    >
      {content}
    </Tooltip.Content>
  </Tooltip>
)
