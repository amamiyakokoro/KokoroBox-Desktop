import { Card, cn } from '@heroui/react'
import type React from 'react'
import { LuDownload, LuInbox } from 'react-icons/lu'

interface CollectionGridProps {
  children: React.ReactNode
  className?: string
}

export const CollectionGrid: React.FC<CollectionGridProps> = ({ children, className }) => (
  <div
    className={cn(
      'grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),24rem))] items-stretch justify-start gap-3 p-3',
      className
    )}
  >
    {children}
  </div>
)

interface CollectionCardProps extends React.ComponentProps<typeof Card> {
  isBusy?: boolean
  isCurrent?: boolean
}

export const CollectionCard: React.FC<CollectionCardProps> = ({
  children,
  className,
  isBusy,
  isCurrent,
  ...props
}) => (
  <Card
    {...props}
    className={cn(
      'group relative h-full w-full min-w-0 gap-0 overflow-hidden p-0 transition-[border-color,background-color,box-shadow,opacity] duration-150 hover:border-accent/30 hover:shadow-sm focus-within:ring-2 focus-within:ring-accent/35',
      isCurrent && 'border-accent/55 bg-accent-soft/35',
      isBusy && 'opacity-60',
      className
    )}
    data-current={isCurrent || undefined}
  >
    {children}
  </Card>
)

interface CollectionDropZoneProps {
  active: boolean
  children: React.ReactNode
  label: string
}

export const CollectionDropZone: React.FC<CollectionDropZoneProps> = ({
  active,
  children,
  label
}) => (
  <div className="relative min-h-48">
    <div
      className={cn('transition-[filter,opacity] duration-150', active && 'blur-[1px] opacity-45')}
    >
      {children}
    </div>
    {active ? (
      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-3 z-20 flex min-h-40 items-center justify-center rounded-xl border-2 border-dashed border-accent/55 bg-accent-soft/80 text-accent-soft-foreground shadow-sm"
      >
        <div className="flex flex-col items-center gap-2 text-sm font-semibold">
          <LuDownload aria-hidden="true" className="text-2xl" />
          <span>{label}</span>
        </div>
      </div>
    ) : null}
  </div>
)

interface CollectionEmptyStateProps {
  action?: React.ReactNode
  description: string
  icon?: React.ReactNode
  title: string
}

export const CollectionEmptyState: React.FC<CollectionEmptyStateProps> = ({
  action,
  description,
  icon,
  title
}) => (
  <div className="col-span-full flex min-h-56 w-full max-w-96 justify-self-center flex-col items-center justify-center px-6 text-center">
    <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-xl text-accent-soft-foreground">
      {icon ?? <LuInbox aria-hidden="true" />}
    </div>
    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    <p className="mt-1 max-w-72 text-xs leading-5 text-muted">{description}</p>
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
)
