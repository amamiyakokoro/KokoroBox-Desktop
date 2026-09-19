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
  indicatorClassName?: string
  isDisabled?: boolean
}

interface KokoTabsProps {
  ariaLabel: string
  className?: string
  indicatorClassName?: string
  listClassName?: string
  listContainerClassName?: string
  options: KokoTabOption[]
  selectedKey: string
  tabClassName?: string
  variant?: React.ComponentProps<typeof Tabs>['variant']
  onChange: (key: string) => void | Promise<void>
}

export const KokoTabs: React.FC<KokoTabsProps> = ({
  ariaLabel,
  className,
  indicatorClassName,
  listClassName,
  listContainerClassName,
  options,
  selectedKey,
  tabClassName,
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
      <Tabs.ListContainer className={listContainerClassName}>
        <Tabs.List aria-label={ariaLabel} className={listClassName}>
          {options.map((option) => (
            <Tabs.Tab
              key={option.id}
              id={option.id}
              className={tabClassName}
              isDisabled={option.isDisabled}
            >
              {option.label}
              <Tabs.Indicator className={option.indicatorClassName ?? indicatorClassName} />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
}

export const SettingTabs = KokoTabs
