import { Tabs, cn } from '@heroui/react'
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
  options: KokoTabOption[]
  selectedKey: string
  variant?: React.ComponentProps<typeof Tabs>['variant']
  onChange: (key: string) => void | Promise<void>
}

export const KokoTabs: React.FC<KokoTabsProps> = ({
  ariaLabel,
  className,
  options,
  selectedKey,
  variant = 'secondary',
  onChange
}) => {
  return (
    <Tabs
      className={cn('max-w-full shrink-0', className)}
      selectedKey={selectedKey}
      variant={variant}
      onSelectionChange={(key) => void onChange(String(key))}
    >
      <Tabs.ListContainer className="max-w-full">
        <Tabs.List aria-label={ariaLabel}>
          {options.map((option) => (
            <Tabs.Tab
              key={option.id}
              id={option.id}
              className="min-w-max whitespace-nowrap"
              isDisabled={option.isDisabled}
            >
              <span className="whitespace-nowrap">{option.label}</span>
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
}

export const KokoSegmentedControl: React.FC<Omit<KokoTabsProps, 'variant'>> = ({
  ariaLabel,
  className,
  options,
  selectedKey,
  onChange
}) => {
  return (
    <Tabs
      className={cn('w-fit max-w-full shrink-0', className)}
      selectedKey={selectedKey}
      variant="primary"
      onSelectionChange={(key) => void onChange(String(key))}
    >
      <Tabs.ListContainer className="max-w-full">
        <Tabs.List aria-label={ariaLabel}>
          {options.map((option) => (
            <Tabs.Tab
              key={option.id}
              id={option.id}
              className="min-w-16 shrink-0 whitespace-nowrap px-3"
              isDisabled={option.isDisabled}
            >
              <span className="whitespace-nowrap">{option.label}</span>
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
}
