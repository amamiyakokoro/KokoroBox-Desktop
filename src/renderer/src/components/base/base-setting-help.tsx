import { tr } from '../../../../shared/i18n'
import { Button, Tooltip, cn } from '@heroui/react'
import type React from 'react'
import { LuCircleHelp } from 'react-icons/lu'

export interface SettingHelpProps {
  children: React.ReactNode
  ariaLabel?: string
  className?: string
}

export const SettingHelp: React.FC<SettingHelpProps> = ({
  children,
  ariaLabel = tr('Description'),
  className
}) => (
  <Tooltip delay={200}>
    <Tooltip.Trigger>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className={cn(
          'app-nodrag size-7 min-w-7 shrink-0 text-foreground-500 hover:text-foreground',
          className
        )}
        aria-label={ariaLabel}
      >
        <LuCircleHelp aria-hidden="true" className="text-base" />
      </Button>
    </Tooltip.Trigger>
    <Tooltip.Content className="max-w-72 text-sm leading-5">{children}</Tooltip.Content>
  </Tooltip>
)

export default SettingHelp
