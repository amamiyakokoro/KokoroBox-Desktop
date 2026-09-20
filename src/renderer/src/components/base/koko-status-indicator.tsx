import { cn } from '@heroui/react'
import type React from 'react'

export type KokoStatusTone = 'neutral' | 'success' | 'warning' | 'danger'

const statusDotClasses: Record<KokoStatusTone, string> = {
  neutral: 'bg-foreground-300',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger'
}

const statusTextClasses: Record<KokoStatusTone, string> = {
  neutral: 'text-foreground-500',
  success: 'text-foreground-500',
  warning: 'text-warning',
  danger: 'text-danger'
}

interface KokoStatusIndicatorProps {
  children: React.ReactNode
  className?: string
  title?: string
  tone?: KokoStatusTone
}

export const KokoStatusIndicator: React.FC<KokoStatusIndicatorProps> = ({
  children,
  className,
  title,
  tone = 'neutral'
}) => (
  <span
    className={cn(
      'inline-flex h-4 min-w-0 items-center gap-2 text-xs leading-4',
      statusTextClasses[tone],
      className
    )}
    data-status-tone={tone}
    title={title}
  >
    <span
      aria-hidden="true"
      className={cn('size-2 shrink-0 rounded-full', statusDotClasses[tone])}
    />
    <span className="min-w-0 truncate">{children}</span>
  </span>
)
