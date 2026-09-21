import { tr } from '../../../../shared/i18n'
import { IoJournalOutline } from 'react-icons/io5'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import React from 'react'
import { SiderIconButton, SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const getLogLevelLabel = (level: LogLevel): string => {
  switch (level) {
    case 'silent':
      return tr('Silent')
    case 'error':
      return tr('Error')
    case 'warning':
      return tr('Warning')
    case 'debug':
      return tr('Debug')
    default:
      return tr('Info')
  }
}

const LogCard: React.FC<Props> = (props) => {
  const { appConfig } = useAppConfig()
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { iconOnly } = props
  const {
    logCardStatus = 'col-span-1',
    disableAnimation = false,
    realtimeLogLevel
  } = appConfig || {}
  const logLevel = realtimeLogLevel ?? controledMihomoConfig?.['log-level'] ?? 'info'
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/logs')
  const {
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'log'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null

  if (iconOnly) {
    return (
      <div className={`${logCardStatus} flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('Logs')}
          placement="right"
          onPress={() => navigate('/logs')}
        >
          <IoJournalOutline className="text-[20px]" />
        </SiderIconButton>
      </div>
    )
  }
  return (
    <div
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
      className={`${logCardStatus} log-card`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<IoJournalOutline />}
          title={tr('Logs')}
          description={`${getLogLevelLabel(logLevel)} · ${tr('Real time')}`}
          active={match}
          onPress={() => navigate('/logs')}
        />
      </div>
    </div>
  )
}

export default LogCard
