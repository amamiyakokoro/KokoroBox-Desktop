import { tr } from '../../../../shared/i18n'
import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IoLayersOutline } from 'react-icons/io5'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { SiderIconButton, SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const ResourceCard: React.FC<Props> = (props) => {
  const { appConfig } = useAppConfig()
  const { iconOnly } = props
  const { resourceCardStatus = 'col-span-1', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/resources')
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'resource'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null

  if (iconOnly) {
    return (
      <div className={`${resourceCardStatus} flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('External resources')}
          placement="right"
          onPress={() => navigate('/resources')}
        >
          <IoLayersOutline className="text-[20px]" />
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
      className={`${resourceCardStatus} resource-card`}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<IoLayersOutline />}
          title={tr('External resources')}
          active={match}
          onPress={() => navigate('/resources')}
        />
      </div>
    </div>
  )
}

export default ResourceCard
