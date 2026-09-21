import { cn, Surface } from '@heroui/react'
import React from 'react'

interface SettingSubgroupProps {
  children: React.ReactNode
  className?: string
  label?: string
}

/** Groups settings whose availability or meaning depends on a preceding parent setting. */
const SettingSubgroup: React.FC<SettingSubgroupProps> = ({ children, className, label }) => (
  <Surface
    aria-label={label}
    className={cn(
      'setting-subgroup my-1 ml-3 rounded-r-lg border-l-2 border-separator/80 px-2',
      className
    )}
    role={label ? 'group' : undefined}
    variant="secondary"
  >
    {children}
  </Surface>
)

export default SettingSubgroup
