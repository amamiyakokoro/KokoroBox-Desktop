import { cn } from '@heroui/react'
import type React from 'react'

export type KokoStatusTone = 'neutral' | 'success' | 'warning' | 'danger'

const statusDotClasses: Record<KokoStatusTone, string> = {
  neutral: 'bg-muted',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger'
}

const statusTextClasses: Record<KokoStatusTone, string> = {
  neutral: 'text-muted',
  success: 'text-muted',
  warning: 'text-warning',
  danger: 'text-danger'
}

interface KokoStatusIndicatorProps {
  allowTextWrap?: boolean
  children: React.ReactNode
  className?: string
  title?: string
  tone?: KokoStatusTone
}

export const KokoStatusIndicator: React.FC<KokoStatusIndicatorProps> = ({
  allowTextWrap = false,
  children,
  className,
  title,
  tone = 'neutral'
}) => (
  <span
    className={cn(
      'inline-flex min-w-0 gap-2 text-xs leading-4',
      allowTextWrap ? 'min-h-4 items-start' : 'h-4 items-center',
      statusTextClasses[tone],
      className
    )}
    data-status-tone={tone}
    title={title}
  >
    <span
      aria-hidden="true"
      className={cn(
        'size-2 shrink-0 rounded-full',
        allowTextWrap && 'mt-1',
        statusDotClasses[tone]
      )}
    />
    <span className={cn('min-w-0', allowTextWrap ? 'break-words' : 'truncate')}>{children}</span>
  </span>
)
