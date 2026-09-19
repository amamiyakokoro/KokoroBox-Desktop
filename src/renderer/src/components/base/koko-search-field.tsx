import { Button, InputGroup, cn } from '@heroui/react'
import React from 'react'
import { LuSearch, LuX } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'

interface KokoSearchFieldProps extends Omit<
  React.ComponentProps<typeof InputGroup.Input>,
  'className' | 'disabled' | 'onChange' | 'size'
> {
  className?: string
  inputRef?: React.Ref<HTMLInputElement>
  isDisabled?: boolean
  onClear?: () => void
  onValueChange: (value: string) => void
}

export const KokoSearchField: React.FC<KokoSearchFieldProps> = ({
  className,
  inputRef,
  isDisabled,
  onClear,
  onValueChange,
  value,
  ...inputProps
}) => (
  <InputGroup
    className={cn('h-9 min-h-9 w-64 max-w-full shrink-0', className)}
    variant="secondary"
  >
    <InputGroup.Prefix className="h-full items-center">
      <LuSearch aria-hidden="true" className="shrink-0 text-foreground-400" />
    </InputGroup.Prefix>
    <InputGroup.Input
      {...inputProps}
      ref={inputRef}
      className="h-9 py-0"
      disabled={isDisabled}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
    {value ? (
      <InputGroup.Suffix className="h-full items-center">
        <Button
          aria-label={tr('Clear field')}
          className="h-6 w-6 min-w-6"
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={() => {
            onClear?.()
            if (!onClear) onValueChange('')
          }}
        >
          <LuX aria-hidden="true" />
        </Button>
      </InputGroup.Suffix>
    ) : null}
  </InputGroup>
)
