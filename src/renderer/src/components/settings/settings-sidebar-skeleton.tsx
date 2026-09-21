import { cn } from '@heroui/react'
import { platform } from '@renderer/utils/init'

interface SettingsSidebarSkeletonProps {
  iconOnly?: boolean
  useWindowFrame?: boolean
}

const categoryRows = Array.from({ length: 7 }, (_, index) => index)

const SettingsSidebarSkeleton = ({
  iconOnly = false,
  useWindowFrame = false
}: SettingsSidebarSkeletonProps): React.JSX.Element => {
  if (iconOnly) {
    return (
      <div aria-hidden="true" className="flex h-full min-h-0 flex-col bg-surface-secondary/65">
        <div className="app-drag h-12.25 shrink-0" />
        <div className="flex shrink-0 flex-col items-center gap-2 px-2 pb-2">
          <div className="size-8 rounded-lg bg-surface/70" />
          <div className="size-8 rounded-lg bg-surface/70" />
        </div>
        <div className="h-px shrink-0 bg-separator" />
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 px-2 py-2">
          {categoryRows.map((index) => (
            <div key={index} className="size-8 shrink-0 rounded-lg bg-surface/70" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div aria-hidden="true" className="flex h-full min-h-0 flex-col bg-surface-secondary/65">
      <div
        className={cn(
          'app-drag flex h-12.25 shrink-0 items-center px-2',
          !useWindowFrame && platform === 'darwin' && 'pl-18'
        )}
      >
        <div className="h-9 w-full rounded-lg bg-surface/70" />
      </div>
      <div className="h-px shrink-0 bg-separator" />
      <div className="flex min-h-0 flex-1 flex-col pt-3">
        <div className="shrink-0 px-3 pb-3">
          <div className="h-9 w-full rounded-lg bg-surface/75" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 px-3 pb-3">
          {categoryRows.map((index) => (
            <div key={index} className="flex h-8 shrink-0 items-center gap-2 px-3">
              <div className="size-4 rounded bg-surface/80" />
              <div
                className="h-3 rounded bg-surface/80"
                style={{ width: `${46 + ((index * 13) % 34)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SettingsSidebarSkeleton
