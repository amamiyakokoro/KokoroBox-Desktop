import { Tabs } from '@heroui-v3/react'
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
  variant,
  onChange
}) => {
  return (
    <Tabs
      className={className}
      selectedKey={selectedKey}
      variant={variant}
      onSelectionChange={(key) => void onChange(String(key))}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label={ariaLabel}>
          {options.map((option) => (
            <Tabs.Tab key={option.id} id={option.id} isDisabled={option.isDisabled}>
              {option.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
}

export const SettingTabs = KokoTabs
