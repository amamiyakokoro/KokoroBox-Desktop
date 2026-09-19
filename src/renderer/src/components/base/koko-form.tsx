import { Button, InputGroup, Label, ListBox, Select, cn, type SelectProps } from '@heroui/react'
import React from 'react'
import { LuX } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'

type KokoTextFieldClassNames = {
  input?: string
  inputWrapper?: string
}

export type KokoControlWidth = 'number' | 'short' | 'select' | 'url' | 'full'

const controlWidthClassNames: Record<KokoControlWidth, string> = {
  number: 'w-32 max-w-full',
  short: 'w-full max-w-72',
  select: 'w-56 max-w-full',
  url: 'w-full max-w-120',
  full: 'w-full'
}

interface KokoTextFieldProps extends Omit<
  React.ComponentProps<typeof InputGroup.Input>,
  'className' | 'disabled' | 'onChange' | 'size'
> {
  className?: string
  classNames?: KokoTextFieldClassNames
  controlWidth?: KokoControlWidth
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
  controlWidth,
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
      controlWidth && controlWidthClassNames[controlWidth],
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
  controlWidth?: KokoControlWidth
  density?: 'normal' | 'compact'
  disallowEmptySelection?: boolean
  isDisabled?: boolean
  label?: React.ReactNode
  labelPlacement?: 'inside' | 'outside'
  options: KokoSelectOption[]
  placeholder?: string
  valueClassName?: string
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
  valueClassName?: string
}> = ({ density, label, labelPlacement, options, placeholder, valueClassName }) => (
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
        labelPlacement === 'outside' && density === 'compact' && 'h-8 min-h-8 items-center py-0'
      )}
    >
      <Select.Value className={cn('min-w-0 truncate', valueClassName)}>
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
    controlWidth,
    density = 'normal',
    disallowEmptySelection = false,
    isDisabled,
    label,
    labelPlacement = 'outside',
    options,
    placeholder,
    valueClassName,
    variant = 'primary'
  } = props

  if (props.multiple) {
    return (
      <Select<object, 'multiple'>
        aria-label={props['aria-label']}
        className={cn(
          labelPlacement === 'inside' && 'relative',
          controlWidth && controlWidthClassNames[controlWidth],
          className
        )}
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
          valueClassName={valueClassName}
        />
      </Select>
    )
  }

  return (
    <Select
      aria-label={props['aria-label']}
      className={cn(
        labelPlacement === 'inside' && 'relative',
        controlWidth && controlWidthClassNames[controlWidth],
        className
      )}
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
        valueClassName={valueClassName}
      />
    </Select>
  )
}
