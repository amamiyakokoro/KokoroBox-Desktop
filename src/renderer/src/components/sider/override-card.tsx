import { tr } from '../../../../shared/i18n'
import React from 'react'
import { MdFormatOverline } from 'react-icons/md'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useOverrideConfig } from '@renderer/hooks/use-override-config'
import { SiderIconButton, SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const OverrideCard: React.FC<Props> = (props) => {
  const { appConfig } = useAppConfig()
  const { overrideConfig } = useOverrideConfig()
  const { iconOnly } = props
  const { overrideCardStatus = 'col-span-1', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/override')
  const {
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
        <SiderIconButton
          active={match}
          label={tr('Overrides')}
          placement="right"
          onPress={() => navigate('/override')}
        >
          <MdFormatOverline className="text-[20px]" />
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
      className={`${overrideCardStatus} override-card`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<MdFormatOverline />}
          title={tr('Overrides')}
          description={tr('{0} overrides', [overrideConfig?.items?.length ?? 0])}
          active={match}
          onPress={() => navigate('/override')}
        />
      </div>
    </div>
  )
}

export default OverrideCard
