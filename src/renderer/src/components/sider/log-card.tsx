import { tr } from '../../../../shared/i18n'
import { Button, Tooltip } from '@heroui/react'
import { IoJournalOutline } from 'react-icons/io5'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React from 'react'
import { SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const LogCard: React.FC<Props> = (props) => {
  const { appConfig } = useAppConfig()
  const { iconOnly } = props
  const { logCardStatus = 'col-span-1', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/logs')
  const {
    attributes,
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
        <Tooltip content={tr('Logs')} placement="right">
          <Button
            size="sm"
            isIconOnly
            aria-label={tr('Logs')}
            color={match ? 'primary' : 'default'}
            variant={match ? 'solid' : 'light'}
            onPress={() => {
              navigate('/logs')
            }}
          >
            <IoJournalOutline className="text-[20px]" />
          </Button>
        </Tooltip>
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
        {...attributes}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<IoJournalOutline />}
          title={tr('Logs')}
          active={match}
          onPress={() => navigate('/logs')}
        />
      </div>
    </div>
  )
}

export default LogCard
