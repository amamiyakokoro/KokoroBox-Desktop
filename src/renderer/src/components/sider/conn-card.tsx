import { tr } from '../../../../shared/i18n'
import { FaCircleArrowDown, FaCircleArrowUp } from 'react-icons/fa6'
import { useLocation, useNavigate } from 'react-router-dom'
import { calcTraffic } from '@renderer/utils/calc'
import React, { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IoLink } from 'react-icons/io5'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import TrafficChart from './traffic-chart'
import { SiderIconButton, SiderStatusCard } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const compactTrafficUnits = ['B', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'] as const

const calcCompactTraffic = (bytes: number): string => {
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < compactTrafficUnits.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${Number(value.toFixed(precision))}${compactTrafficUnits[unitIndex]}/s`
}

const ConnCard: React.FC<Props> = ({ iconOnly }) => {
  const { appConfig } = useAppConfig()
  const { connectionCardStatus = 'col-span-2', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/connections')
  const [upload, setUpload] = useState(0)
  const [download, setDownload] = useState(0)
  const {
    listeners,
    setNodeRef,
    transform: sortableTransform,
    transition,
    isDragging
  } = useSortable({ id: 'connection' })
  const [trafficData, setTrafficData] = useState(() =>
    Array(10)
      .fill(0)
      .map((traffic, index) => ({ traffic, index }))
  )
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const transform = sortableTransform
    ? { x: sortableTransform.x, y: sortableTransform.y, scaleX: 1, scaleY: 1 }
    : null
  const downloadRate = `${calcTraffic(download)}/s`
  const uploadRate = `${calcTraffic(upload)}/s`

  useEffect(() => {
    const handleTraffic = (_event: unknown, info: ControllerTraffic): void => {
      setUpload(info.up)
      setDownload(info.down)

      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)

      updateTimeoutRef.current = setTimeout(() => {
        setTrafficData((previous) => [
          ...previous.slice(1),
          { traffic: info.up + info.down, index: Date.now() }
        ])
        updateTimeoutRef.current = null
      }, 100)
    }

    window.electron.ipcRenderer.on('mihomoTraffic', handleTraffic)

    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('mihomoTraffic')
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)
    }
  }, [])

  if (iconOnly) {
    return (
      <div className={`${connectionCardStatus} flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('Connections')}
          placement="right"
          onPress={() => navigate('/connections')}
        >
          <IoLink className="text-[20px]" />
        </SiderIconButton>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
      className={`${connectionCardStatus} conn-card ${isDragging && !disableAnimation ? 'scale-[0.98]' : ''}`}
    >
      <SiderStatusCard
        icon={<IoLink />}
        title={tr('Connections')}
        metadata={
          <div className="sider-connection-metadata grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1.5 text-xs leading-4 text-muted tabular-nums">
            <span
              className="grid w-full min-w-0 grid-cols-[0.75rem_minmax(0,1fr)] items-center gap-1 whitespace-nowrap"
              title={`${tr('Download speed')}: ${downloadRate}`}
            >
              <span className="sr-only">{`${tr('Download speed')}: ${downloadRate}`}</span>
              <FaCircleArrowDown aria-hidden="true" className="size-3 shrink-0" />
              <span aria-hidden="true" className="min-w-0 text-left">
                <span className="sider-connection-rate__full">{downloadRate}</span>
                <span className="sider-connection-rate__compact">
                  {calcCompactTraffic(download)}
                </span>
              </span>
            </span>
            <span
              className="grid w-full min-w-0 grid-cols-[0.75rem_minmax(0,1fr)] items-center gap-1 whitespace-nowrap"
              title={`${tr('Upload speed')}: ${uploadRate}`}
            >
              <span className="sr-only">{`${tr('Upload speed')}: ${uploadRate}`}</span>
              <FaCircleArrowUp aria-hidden="true" className="size-3 shrink-0" />
              <span aria-hidden="true" className="min-w-0 text-right">
                <span className="sider-connection-rate__full">{uploadRate}</span>
                <span className="sider-connection-rate__compact">
                  {calcCompactTraffic(upload)}
                </span>
              </span>
            </span>
          </div>
        }
        active={match}
        onPress={() => navigate('/connections')}
        details={
          <div className="relative -mx-2.5 -my-2 h-7 overflow-hidden rounded-b-xl opacity-40">
            <TrafficChart data={trafficData} />
          </div>
        }
      />
    </div>
  )
}

export default React.memo(ConnCard, (previousProps, nextProps) => {
  return previousProps.iconOnly === nextProps.iconOnly
})
