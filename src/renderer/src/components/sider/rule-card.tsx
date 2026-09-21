import { tr } from '../../../../shared/i18n'
import { MdOutlineAltRoute } from 'react-icons/md'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRules } from '@renderer/hooks/use-rules'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React from 'react'
import { SiderIconButton, SiderNavItem } from './sider-surfaces'
import { resolveRulesCardStatus } from './sider-order'

interface Props {
  iconOnly?: boolean
}

const RuleCard: React.FC<Props> = (props) => {
  const { appConfig } = useAppConfig()
  const { iconOnly } = props
  const { disableAnimation = false } = appConfig || {}
  const ruleCardStatus = resolveRulesCardStatus(
    appConfig?.ruleCardStatus,
    appConfig?.resourceCardStatus
  )
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/rules') || location.pathname.includes('/resources')
  const { rules } = useRules()
  const {
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'rule'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null

  if (iconOnly) {
    return (
      <div className={`${ruleCardStatus} flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('Rules')}
          placement="right"
          onPress={() => navigate('/rules')}
        >
          <MdOutlineAltRoute className="text-[20px]" />
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
      className={`${ruleCardStatus} rule-card`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<MdOutlineAltRoute />}
          title={tr('Rules')}
          endMetadata={rules?.rules?.length ?? 0}
          active={match}
          onPress={() => navigate('/rules')}
        />
      </div>
    </div>
  )
}

export default RuleCard
