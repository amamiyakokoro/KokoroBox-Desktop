import { tr } from '../../../../shared/i18n'
import { Button, Tooltip } from '@heroui/react'
import { FaCircleArrowDown, FaCircleArrowUp } from 'react-icons/fa6'
import { useLocation, useNavigate } from 'react-router-dom'
import { calcTraffic } from '@renderer/utils/calc'
import React, { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IoLink } from 'react-icons/io5'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import TrafficChart from './traffic-chart'
import { SiderStatusCard } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
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
    attributes,
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
        <Tooltip content={tr('Connections')} placement="right">
          <Button
            size="sm"
            isIconOnly
            aria-label={tr('Connections')}
            color={match ? 'primary' : 'default'}
            variant={match ? 'solid' : 'light'}
            onPress={() => navigate('/connections')}
          >
            <IoLink className="text-[20px]" />
          </Button>
        </Tooltip>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
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
        description={
          <span className="inline-flex items-center gap-1">
            <FaCircleArrowDown aria-hidden="true" />
            {calcTraffic(download)}/s
          </span>
        }
        status={
          <span className="inline-flex items-center gap-1">
            <FaCircleArrowUp aria-hidden="true" />
            {calcTraffic(upload)}/s
          </span>
        }
        active={match}
        onPress={() => navigate('/connections')}
        details={
          <div className="relative -mx-2.5 -my-2 h-7 overflow-hidden rounded-b-xl opacity-35">
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
