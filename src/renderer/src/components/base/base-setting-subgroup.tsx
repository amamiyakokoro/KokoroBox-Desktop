import { cn } from '@heroui/react'
import React from 'react'

interface SettingSubgroupProps {
  children: React.ReactNode
  className?: string
  label?: string
}

/** Groups settings whose availability or meaning depends on a preceding parent setting. */
const SettingSubgroup: React.FC<SettingSubgroupProps> = ({ children, className, label }) => (
  <div
    aria-label={label}
    className={cn('setting-subgroup my-1 ml-3 border-l-2 border-separator/80 pl-3', className)}
    role={label ? 'group' : undefined}
  >
    {children}
  </div>
)

export default SettingSubgroup
