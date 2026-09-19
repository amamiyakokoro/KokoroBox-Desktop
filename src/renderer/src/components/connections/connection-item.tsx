import { tr } from '../../../../shared/i18n'
import { Avatar, Card, Chip } from '@heroui/react'
import { KokoButton as Button } from '../base/koko-form'
import { calcTraffic } from '@renderer/utils/calc'
import dayjs from 'dayjs'
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { CgClose, CgTrash } from 'react-icons/cg'
import { connectionIdentityLabel } from './connection-identity'

interface Props {
  index: number
  info: ControllerConnectionDetail
  displayIcon?: boolean
  iconUrl: string
  displayName?: string
  hideProcess?: boolean
  selected: ControllerConnectionDetail | undefined
  setSelected: React.Dispatch<React.SetStateAction<ControllerConnectionDetail | undefined>>
  setIsDetailModalOpen: React.Dispatch<React.SetStateAction<boolean>>
  close: (id: string) => void
}

const ConnectionItemComponent: React.FC<Props> = ({
  index,
  info,
  displayIcon,
  iconUrl,
  displayName,
  hideProcess,
  close,
  setSelected,
  setIsDetailModalOpen
}) => {
  const fallbackProcessName = useMemo(
    () => connectionIdentityLabel(info, tr('Application routing')).replace(/\.exe$/, ''),
    [
      info.metadata.process,
      info.metadata.sourceIP,
      info.metadata.inboundName,
      info.metadata.inboundPort,
      info.metadata.type
    ]
  )
  const processName = displayName || fallbackProcessName

  const destination = useMemo(
    () =>
      info.metadata.host ||
      info.metadata.sniffHost ||
      info.metadata.destinationIP ||
      info.metadata.remoteDestination,
    [
      info.metadata.host,
      info.metadata.sniffHost,
      info.metadata.destinationIP,
      info.metadata.remoteDestination
    ]
  )

  const [timeAgo, setTimeAgo] = useState(() => dayjs(info.start).fromNow())

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeAgo(dayjs(info.start).fromNow())
    }, 60000)

    return () => clearInterval(timer)
  }, [info.start])

  const uploadTraffic = useMemo(() => calcTraffic(info.upload), [info.upload])

  const downloadTraffic = useMemo(() => calcTraffic(info.download), [info.download])

  const uploadSpeed = useMemo(
    () => (info.uploadSpeed ? calcTraffic(info.uploadSpeed) : null),
    [info.uploadSpeed]
  )

  const downloadSpeed = useMemo(
    () => (info.downloadSpeed ? calcTraffic(info.downloadSpeed) : null),
    [info.downloadSpeed]
  )

  const hasSpeed = useMemo(
    () => Boolean(info.uploadSpeed || info.downloadSpeed),
    [info.uploadSpeed, info.downloadSpeed]
  )

  const handleCardPress = useCallback(() => {
    setSelected(info)
    setIsDetailModalOpen(true)
  }, [info, setSelected, setIsDetailModalOpen])

  const handleClose = useCallback(() => {
    close(info.id)
  }, [close, info.id])

  return (
    <div className={`px-2 pb-1.5 ${index === 0 ? 'pt-1.5' : ''}`} style={{ minHeight: 68 }}>
      <Card
        role="button"
        tabIndex={0}
        className="group w-full min-w-0 cursor-pointer gap-0 overflow-hidden rounded-xl p-0 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
        onClick={handleCardPress}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          handleCardPress()
        }}
      >
        <div className="flex w-full items-center justify-between">
          {displayIcon && (
            <div className="shrink-0 pl-2">
              <Avatar size="md" className="size-11 bg-transparent">
                <Avatar.Image className="object-contain" src={iconUrl} />
              </Avatar>
            </div>
          )}
          <div className="relative flex min-w-0 flex-1 flex-col justify-start">
            <Card.Header className="relative flex min-h-8 w-full min-w-0 flex-row items-center gap-1 px-3 pb-0 pt-2 pr-12">
              <div className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                <span title={hideProcess ? destination : `${processName} → ${destination}`}>
                  {hideProcess ? destination : `${processName} → ${destination}`}
                </span>
              </div>
              <small className="ml-2 whitespace-nowrap text-[11px] text-foreground-400">
                {timeAgo}
              </small>
              <Button
                color={info.isActive ? 'default' : 'danger'}
                variant="light"
                isIconOnly
                size="sm"
                aria-label={info.isActive ? tr('Close connection') : tr('Delete record')}
                className={`absolute right-2 transition-opacity ${
                  info.isActive
                    ? 'text-foreground-500 opacity-40 group-hover:opacity-100 group-focus-within:opacity-100'
                    : ''
                }`}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onPress={handleClose}
              >
                {info.isActive ? <CgClose className="text-lg" /> : <CgTrash className="text-lg" />}
              </Button>
            </Card.Header>
            <Card.Footer className="px-3 pb-2 pt-1">
              <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap">
                <span
                  className={`rounded-md bg-default-100 px-1.5 py-0.5 text-[11px] ${
                    info.isActive ? 'text-foreground-500' : 'text-danger-500'
                  }`}
                >
                  {info.metadata.type}({info.metadata.network.toUpperCase()})
                </span>
                <Chip className="flag-emoji max-w-52 shrink-0" size="sm" variant="soft">
                  <span className="truncate" title={info.chains[0]}>
                    {info.chains[0]}
                  </span>
                </Chip>
                <span className="text-[11px] text-foreground-500 tabular-nums">
                  ↑ {uploadTraffic} ↓ {downloadTraffic}
                </span>
                {hasSpeed && (
                  <span className="text-xs font-medium text-primary tabular-nums">
                    ↑ {uploadSpeed || '0 B'}/s ↓ {downloadSpeed || '0 B'}/s
                  </span>
                )}
              </div>
            </Card.Footer>
          </div>
        </div>
      </Card>
    </div>
  )
}

const ConnectionItem = memo(ConnectionItemComponent, (prevProps, nextProps) => {
  return (
    prevProps.info.id === nextProps.info.id &&
    prevProps.info.upload === nextProps.info.upload &&
    prevProps.info.download === nextProps.info.download &&
    prevProps.info.uploadSpeed === nextProps.info.uploadSpeed &&
    prevProps.info.downloadSpeed === nextProps.info.downloadSpeed &&
    prevProps.info.isActive === nextProps.info.isActive &&
    prevProps.iconUrl === nextProps.iconUrl &&
    prevProps.displayIcon === nextProps.displayIcon &&
    prevProps.displayName === nextProps.displayName &&
    prevProps.hideProcess === nextProps.hideProcess &&
    prevProps.selected?.id === nextProps.selected?.id
  )
})

export default ConnectionItem
