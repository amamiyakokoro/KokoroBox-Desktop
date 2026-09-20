import { Tabs, ToggleButton, ToggleButtonGroup, cn } from '@heroui/react'
import type React from 'react'
import type { SettingItemProps } from './base-setting-item'

export const settingItemProps = {
  variant: 'compact',
  contentAlign: 'end'
} satisfies Pick<SettingItemProps, 'variant' | 'contentAlign'>

export interface KokoTabOption {
  id: string
  label: React.ReactNode
  isDisabled?: boolean
}

interface KokoTabsProps {
  ariaLabel: string
  className?: string
  density?: 'normal' | 'toolbar'
  options: KokoTabOption[]
  selectionStyle?: 'native' | 'accent-underline'
  selectedKey: string
  variant?: React.ComponentProps<typeof Tabs>['variant']
  onChange: (key: string) => void | Promise<void>
}

export interface KokoSegmentedOption {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
  isDisabled?: boolean
}

interface KokoSegmentedControlProps {
  ariaLabel: string
  className?: string
  options: KokoSegmentedOption[]
  selectedKey: string
  onChange: (key: string) => void | Promise<void>
}

export const KokoTabs: React.FC<KokoTabsProps> = ({
  ariaLabel,
  className,
  density = 'normal',
  options,
  selectionStyle = 'native',
  selectedKey,
  variant = 'secondary',
  onChange
}) => {
  return (
    <Tabs
      className={cn(
        'shrink-0',
        density === 'toolbar' ? 'h-9 w-max max-w-none' : 'max-w-full',
        className
      )}
      selectedKey={selectedKey}
      variant={variant}
      onSelectionChange={(key) => void onChange(String(key))}
    >
      <Tabs.ListContainer
        className={cn(density === 'toolbar' ? 'h-9 w-max max-w-none' : 'max-w-full')}
      >
        <Tabs.List aria-label={ariaLabel} className={cn(density === 'toolbar' && 'h-9 w-max')}>
          {options.map((option) => (
            <Tabs.Tab
              key={option.id}
              id={option.id}
              className={cn(
                'min-w-max whitespace-nowrap',
                density === 'toolbar' && 'h-9 px-2.5',
                selectionStyle === 'accent-underline' &&
                  'rounded-md text-foreground-500 transition-colors hover:bg-surface-secondary/60 hover:text-foreground data-[selected=true]:font-medium data-[selected=true]:text-accent-soft-foreground'
              )}
              isDisabled={option.isDisabled}
            >
              <span className="whitespace-nowrap">{option.label}</span>
              <Tabs.Indicator
                className={cn(selectionStyle === 'accent-underline' && 'h-0.5 bg-accent')}
              />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
}

export const KokoSegmentedControl: React.FC<KokoSegmentedControlProps> = ({
  ariaLabel,
  className,
  options,
  selectedKey,
  onChange
}) => {
  return (
    <ToggleButtonGroup
      aria-label={ariaLabel}
      className={cn('w-fit max-w-full shrink-0 whitespace-nowrap', className)}
      disallowEmptySelection
      selectedKeys={new Set([selectedKey])}
      selectionMode="single"
      size="sm"
      onSelectionChange={(keys) => {
        const key = keys.values().next().value
        if (key !== undefined) void onChange(String(key))
      }}
    >
      {options.map((option, index) => (
        <ToggleButton
          key={option.id}
          id={option.id}
          className="min-w-16 shrink-0 whitespace-nowrap"
          isDisabled={option.isDisabled}
        >
          {index > 0 ? <ToggleButtonGroup.Separator /> : null}
          {option.icon}
          <span className="whitespace-nowrap">{option.label}</span>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
