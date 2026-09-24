import { tr } from '../../../../shared/i18n'
import { useLocation, useNavigate } from 'react-router-dom'
import React, { useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IoLink } from 'react-icons/io5'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { emptySiderConnectionCounts, updateSiderConnectionCounts } from './connection-counts'
import { SiderIconButton, SiderStatusCard } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const ConnCard: React.FC<Props> = ({ iconOnly }) => {
  const { appConfig } = useAppConfig()
  const { connectionCardStatus = 'col-span-2', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/connections')
  const [counts, setCounts] = useState(emptySiderConnectionCounts)
  const {
    listeners,
    setNodeRef,
    transform: sortableTransform,
    transition,
    isDragging
  } = useSortable({ id: 'connection' })
  const transform = sortableTransform
    ? { x: sortableTransform.x, y: sortableTransform.y, scaleX: 1, scaleY: 1 }
    : null

  useEffect(() => {
    const removeConnections = window.electron.ipcRenderer.on(
      'mihomoConnections',
      (_event, info: ControllerConnections) => {
        const connections = info.connections
        if (!connections) return
        setCounts((previous) => updateSiderConnectionCounts(previous, connections))
      }
    )
    const removeCoreStopped = window.electron.ipcRenderer.on('core-stopped', () => {
      setCounts(emptySiderConnectionCounts())
    })

    return (): void => {
      removeConnections()
      removeCoreStopped()
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
          <div className="sider-connection-metadata grid min-w-0 grid-cols-2 items-center gap-x-2 text-xs leading-4 tabular-nums">
            <span className="min-w-0 truncate text-muted" title={tr('Active')}>
              {tr('Active')} <span className="font-medium text-foreground">{counts.active}</span>
            </span>
            <span className="min-w-0 truncate text-muted" title={tr('Closed')}>
              {tr('Closed')} <span className="font-medium text-foreground">{counts.closed}</span>
            </span>
          </div>
        }
        active={match}
        onPress={() => navigate('/connections')}
      />
    </div>
  )
}

export default React.memo(ConnCard, (previousProps, nextProps) => {
  return previousProps.iconOnly === nextProps.iconOnly
})
