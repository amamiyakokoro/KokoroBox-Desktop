import { tr } from '../../../../shared/i18n'
import { Avatar, Card } from '@heroui-v3/react'
import { KokoButton as Button } from '../base/koko-form'
import { calcTraffic } from '@renderer/utils/calc'
import React, { memo, useMemo } from 'react'
import { CgClose, CgTrash } from 'react-icons/cg'
import { IoIosArrowBack } from 'react-icons/io'

interface Props {
  groupKey: string
  label: string
  count: number
  upload: number
  download: number
  uploadSpeed: number
  downloadSpeed: number
  expanded: boolean
  isLast: boolean
  isClosed?: boolean
  displayIcon?: boolean
  iconUrl?: string
  displayName?: string
  onToggle: (key: string, currentlyOpen: boolean) => void
  onCloseAll: (key: string) => void
}

const ConnectionGroupHeaderComponent: React.FC<Props> = ({
  groupKey,
  label,
  count,
  upload,
  download,
  uploadSpeed,
  downloadSpeed,
  expanded,
  isLast,
  isClosed,
  displayIcon,
  iconUrl,
  displayName,
  onToggle,
  onCloseAll
}) => {
  const title = useMemo(() => {
    if (displayName) return displayName
    const name = label.replace(/\.exe$/, '')
    return name || tr('Unknown process')
  }, [displayName, label])

  const uploadTraffic = useMemo(() => calcTraffic(upload), [upload])
  const downloadTraffic = useMemo(() => calcTraffic(download), [download])
  const hasSpeed = uploadSpeed > 0 || downloadSpeed > 0
  const uploadSpeedText = useMemo(() => calcTraffic(uploadSpeed), [uploadSpeed])
  const downloadSpeedText = useMemo(() => calcTraffic(downloadSpeed), [downloadSpeed])

  return (
    <div className={`w-full px-2 pt-1.5 ${isLast && !expanded ? 'pb-1.5' : ''}`}>
      <Card
        aria-expanded={expanded}
        role="button"
        tabIndex={0}
        className="group w-full min-w-0 cursor-pointer gap-0 overflow-hidden rounded-xl p-0 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
        onClick={() => onToggle(groupKey, expanded)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onToggle(groupKey, expanded)
        }}
      >
        <Card.Content className="min-h-14 w-full p-0">
          <div className="flex min-h-14 items-center justify-between px-2.5">
            <div className="flex min-w-0 items-center overflow-hidden whitespace-nowrap">
              {displayIcon && (
                <Avatar size="md" className="mr-2 size-10 shrink-0 bg-transparent">
                  <Avatar.Image className="object-contain" src={iconUrl} />
                </Avatar>
              )}
              <div className="flex min-w-0 flex-col justify-center gap-0.5 py-1.5">
                <div className="truncate text-sm font-medium leading-snug" title={title}>
                  {title}
                </div>
                <div className="truncate whitespace-nowrap text-[11px] leading-snug text-foreground-500 tabular-nums">
                  <span className="mr-2">
                    ↑ {uploadTraffic} ↓ {downloadTraffic}
                  </span>
                  {hasSpeed && (
                    <span className="text-xs font-medium text-primary">
                      ↑ {uploadSpeedText}/s ↓ {downloadSpeedText}/s
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <span className="mr-1 text-xs text-foreground-500 tabular-nums">{count}</span>
              <div
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Button
                  variant="light"
                  size="sm"
                  isIconOnly
                  color={isClosed ? 'danger' : 'default'}
                  className={
                    isClosed
                      ? undefined
                      : 'text-foreground-500 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
                  }
                  aria-label={
                    isClosed
                      ? tr('Clear all records for this process')
                      : tr('Close all connections for this process')
                  }
                  onPress={() => onCloseAll(groupKey)}
                >
                  {isClosed ? <CgTrash className="text-lg" /> : <CgClose className="text-lg" />}
                </Button>
              </div>
              <IoIosArrowBack
                className={`ml-0.5 flex h-8 items-center text-base text-foreground-400 transition duration-200 ${
                  expanded ? '-rotate-90' : ''
                }`}
              />
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  )
}

const ConnectionGroupHeader = memo(ConnectionGroupHeaderComponent, (prev, next) => {
  return (
    prev.groupKey === next.groupKey &&
    prev.label === next.label &&
    prev.count === next.count &&
    prev.upload === next.upload &&
    prev.download === next.download &&
    prev.uploadSpeed === next.uploadSpeed &&
    prev.downloadSpeed === next.downloadSpeed &&
    prev.expanded === next.expanded &&
    prev.isLast === next.isLast &&
    prev.isClosed === next.isClosed &&
    prev.displayIcon === next.displayIcon &&
    prev.iconUrl === next.iconUrl &&
    prev.displayName === next.displayName
  )
})

export default ConnectionGroupHeader
