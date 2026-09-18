import { tr } from '../../../../shared/i18n'
import { Button, Tooltip } from '@heroui/react'
import React from 'react'
import { MdFormatOverline } from 'react-icons/md'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const OverrideCard: React.FC<Props> = (props) => {
  const { appConfig } = useAppConfig()
  const { iconOnly } = props
  const { overrideCardStatus = 'col-span-1', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/override')
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'override'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  if (iconOnly) {
    return (
      <div className={`${overrideCardStatus} flex justify-center`}>
        <Tooltip content={tr('Overrides')} placement="right">
          <Button
            size="sm"
            isIconOnly
            aria-label={tr('Overrides')}
            color={match ? 'primary' : 'default'}
            variant={match ? 'solid' : 'light'}
            onPress={() => {
              navigate('/override')
            }}
          >
            <MdFormatOverline className="text-[20px]" />
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
      className={`${overrideCardStatus} override-card`}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<MdFormatOverline />}
          title={tr('Overrides')}
          active={match}
          onPress={() => navigate('/override')}
        />
      </div>
    </div>
  )
}

export default OverrideCard
