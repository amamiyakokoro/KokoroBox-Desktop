import { Avatar, Button, Chip } from '@heroui/react'
import { memo } from 'react'
import type React from 'react'
import { FaLocationCrosshairs } from 'react-icons/fa6'
import { LuChevronRight } from 'react-icons/lu'
import { MdOutlineSpeed } from 'react-icons/md'
import { tr } from '../../../../shared/i18n'

function getGroupTypeLabel(type: MihomoProxyType): string {
  const labels: Partial<Record<MihomoProxyType, string>> = {
    Selector: tr('Selector'),
    Fallback: tr('Fallback'),
    URLTest: tr('URL test'),
    LoadBalance: tr('Load balance'),
    Relay: tr('Relay')
  }
  return labels[type] ?? type
}

interface GroupMetadataProps {
  group: ControllerMixedGroup
  className?: string
}

const GroupMetadata: React.FC<GroupMetadataProps> = ({ group, className = '' }) => {
  const showsSelectedTarget =
    Boolean(group.now) && ['Selector', 'Fallback', 'URLTest'].includes(group.type)

  return (
    <span
      className={`flex min-w-0 items-center gap-1 text-xs leading-4 text-foreground-500 ${className}`}
    >
      <span className="shrink-0">{getGroupTypeLabel(group.type)}</span>
      {showsSelectedTarget ? (
        <>
          <span aria-hidden="true" className="shrink-0 text-accent-soft-foreground/70">
            →
          </span>
          <span className="flag-emoji min-w-0 truncate" title={group.now}>
            {group.now}
          </span>
        </>
      ) : null}
      <span className="shrink-0">· {tr('{0} nodes', [group.all.length])}</span>
    </span>
  )
}

interface ProxyGroupHeaderProps {
  index: number
  group: ControllerMixedGroup
  isOpen: boolean
  isLast: boolean
  groupDisplayLayout: 'hidden' | 'single' | 'double'
  delaying: boolean
  isRelevant: boolean
  onToggle: (index: number, currentlyOpen: boolean) => void
  onScrollToProxy: (index: number) => void
  onGroupDelay: (index: number) => void
}

const ProxyGroupHeader = memo(function ProxyGroupHeader({
  index,
  group,
  isOpen,
  isLast,
  groupDisplayLayout,
  delaying,
  isRelevant,
  onToggle,
  onScrollToProxy,
  onGroupDelay
}: ProxyGroupHeaderProps) {
  return (
    <div className={`w-full px-2 pt-1.5 ${isLast && !isOpen ? 'pb-1.5' : ''}`}>
      <div
        className={`group/proxy relative min-w-0 rounded-lg border transition-[background-color,border-color] duration-150 focus-within:ring-2 focus-within:ring-accent/35 ${
          isRelevant
            ? 'border-accent/40 bg-accent-soft/35'
            : isOpen
              ? 'border-accent/25 bg-accent-soft/20'
              : 'border-separator/70 bg-surface/65 hover:border-accent/25 hover:bg-surface-secondary/70'
        }`}
        data-current={isRelevant || undefined}
        data-expanded={isOpen || undefined}
      >
        <button
          type="button"
          aria-expanded={isOpen}
          aria-label={group.name}
          className="absolute inset-0 z-0 cursor-pointer rounded-lg outline-none"
          onClick={() => onToggle(index, isOpen)}
        />
        <div className="pointer-events-none relative z-1 flex min-h-14 w-full items-center gap-2 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap">
            {group.icon ? (
              <Avatar
                className="mr-2 size-8 shrink-0 overflow-visible! rounded-none! bg-transparent"
                size="sm"
              >
                <Avatar.Image
                  className="object-contain"
                  src={
                    group.icon.startsWith('<svg')
                      ? `data:image/svg+xml;utf8,${group.icon}`
                      : localStorage.getItem(group.icon) || group.icon
                  }
                />
              </Avatar>
            ) : null}
            <div
              className={`flex min-w-0 flex-1 flex-col ${groupDisplayLayout === 'double' ? 'gap-0.5' : 'justify-center'}`}
            >
              <div className="flex min-w-0 items-center gap-1.5 leading-tight">
                <span
                  className="flag-emoji min-w-0 truncate text-sm font-semibold text-foreground"
                  title={group.name}
                >
                  {group.name}
                </span>
                {isRelevant ? (
                  <Chip className="shrink-0" color="accent" size="sm" variant="soft">
                    {tr('Current')}
                  </Chip>
                ) : null}
                {groupDisplayLayout === 'single' ? (
                  <GroupMetadata group={group} className="ml-0.5 max-w-[60%]" />
                ) : null}
              </div>
              {groupDisplayLayout === 'double' ? <GroupMetadata group={group} /> : null}
            </div>
          </div>
          <div
            className="pointer-events-none flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover/proxy:opacity-100 group-focus-within/proxy:opacity-100"
            data-no-group-toggle
          >
            <Button
              aria-label={tr('Test group latency')}
              className="pointer-events-auto h-8 w-8 min-w-8"
              isIconOnly
              isPending={delaying}
              size="sm"
              variant="ghost"
              onPress={() => onGroupDelay(index)}
            >
              <MdOutlineSpeed className="text-lg" />
            </Button>
            <Button
              aria-label={tr('Show selected proxy')}
              className="pointer-events-auto h-8 w-8 min-w-8"
              isIconOnly
              size="sm"
              variant="ghost"
              onPress={() => onScrollToProxy(index)}
            >
              <FaLocationCrosshairs className="text-base" />
            </Button>
            <LuChevronRight
              aria-hidden="true"
              className={`ml-0.5 text-base text-foreground-500 transition-[color,transform] duration-150 group-hover/proxy:text-accent-soft-foreground ${isOpen ? 'rotate-90' : ''}`}
            />
          </div>
        </div>
      </div>
    </div>
  )
})

export default ProxyGroupHeader
