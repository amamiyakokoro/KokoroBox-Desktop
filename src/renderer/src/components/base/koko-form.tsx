import { Button, InputGroup, Label, ListBox, Select, cn, type SelectProps } from '@heroui/react'
import React from 'react'
import { LuX } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'

export type KokoControlWidth = 'number' | 'short' | 'select' | 'path' | 'url' | 'full'

const controlWidthClassNames: Record<KokoControlWidth, string> = {
  number: 'w-32 max-w-full',
  short: 'w-full max-w-72',
  select: 'w-56 max-w-full',
  path: 'w-full max-w-96',
  url: 'w-full max-w-120',
  full: 'w-full'
}

interface KokoTextFieldProps extends Omit<
  React.ComponentProps<typeof InputGroup.Input>,
  'className' | 'disabled' | 'onChange' | 'prefix' | 'size'
> {
  className?: string
  controlWidth?: KokoControlWidth
  inputClassName?: string
  isDisabled?: boolean
  isInvalid?: boolean
  onClear?: () => void
  onChangeValue?: (value: string) => void
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  'data-setting-input'?: string
}

export const KokoTextField: React.FC<KokoTextFieldProps> = ({
  className,
  controlWidth,
  inputClassName,
  isDisabled,
  isInvalid,
  onClear,
  onChangeValue,
  prefix,
  suffix,
  value,
  'data-setting-input': dataSettingInput,
  ...inputProps
}) => (
  <InputGroup
    className={cn('min-h-8', controlWidth && controlWidthClassNames[controlWidth], className)}
    data-invalid={isInvalid || undefined}
    data-setting-input={dataSettingInput}
    variant="secondary"
  >
    {prefix && <InputGroup.Prefix>{prefix}</InputGroup.Prefix>}
    <InputGroup.Input
      {...inputProps}
      aria-invalid={isInvalid || undefined}
      className={cn('min-w-0', inputClassName)}
      disabled={isDisabled}
      value={value}
      onChange={(event) => onChangeValue?.(event.target.value)}
    />
    {(suffix || (onClear && value)) && (
      <InputGroup.Suffix className="shrink-0 gap-1 whitespace-nowrap">
        {suffix}
        {onClear && value ? (
          <Button
            aria-label={tr('Clear field')}
            className="h-6 w-6 min-w-6"
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={onClear}
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
  density?: 'normal' | 'compact' | 'toolbar'
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
  density: 'normal' | 'compact' | 'toolbar'
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
          'text-xs text-muted',
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
        labelPlacement === 'outside' && density === 'compact' && 'h-8 min-h-8 items-center py-0',
        labelPlacement === 'outside' && density === 'toolbar' && 'h-9 min-h-9 items-center py-0'
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
        density === 'compact' || density === 'toolbar'
          ? 'w-max max-w-72'
          : 'max-w-[min(24rem,calc(100vw-2rem))]'
      )}
    >
      <ListBox>
        {options.map((option) => (
          <ListBox.Item
            id={option.id}
            key={option.id}
            className={cn((density === 'compact' || density === 'toolbar') && 'min-h-8 px-2 py-1')}
            isDisabled={option.isDisabled}
            textValue={
              option.textValue ?? (typeof option.label === 'string' ? option.label : option.id)
            }
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{option.label}</span>
              {option.description ? (
                <span className="mt-0.5 block truncate text-xs text-muted">
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
