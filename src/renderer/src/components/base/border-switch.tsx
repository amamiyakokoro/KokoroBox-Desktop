import React from 'react'
import { cn, Switch, type SwitchProps } from '@heroui/react'
import './border-switch.css'

interface BorderSwitchProps extends Omit<SwitchProps, 'children' | 'className' | 'onChange'> {
  children?: React.ReactNode
  className?: string
  isShowBorder?: boolean
  onChange?: SwitchProps['onChange']
  onValueChange?: (isSelected: boolean) => void
}

const BorderSwitch: React.FC<BorderSwitchProps> = (props) => {
  const {
    children,
    className,
    isShowBorder = false,
    onChange,
    onValueChange,
    size = 'sm',
    ...switchProps
  } = props

  return (
    <Switch
      {...switchProps}
      className={cn('border-switch', className)}
      size={size}
      onChange={onChange ?? onValueChange}
    >
      <Switch.Content>
        <Switch.Control
          className={cn('border-2', {
            'border-transparent': !isShowBorder,
            'border-primary-foreground': isShowBorder
          })}
        >
          <Switch.Thumb />
        </Switch.Control>
        {children}
      </Switch.Content>
    </Switch>
  )
}

export default BorderSwitch
