import { tr } from '../../../../shared/i18n'
import { Button, Tooltip } from '@heroui/react'
import { MdOutlineAltRoute } from 'react-icons/md'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRules } from '@renderer/hooks/use-rules'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React from 'react'
import { SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const RuleCard: React.FC<Props> = (props) => {
  const { appConfig } = useAppConfig()
  const { iconOnly } = props
  const { ruleCardStatus = 'col-span-1', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/rules')
  const { rules } = useRules()
  const {
    attributes,
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
        <Tooltip content={tr('Rules')} placement="right">
          <Button
            size="sm"
            isIconOnly
            color={match ? 'primary' : 'default'}
            variant={match ? 'solid' : 'light'}
            onPress={() => {
              navigate('/rules')
            }}
          >
            <MdOutlineAltRoute className="text-[20px]" />
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
      className={`${ruleCardStatus} rule-card`}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<MdOutlineAltRoute />}
          title={tr('Rules')}
          description={tr('{0} rules', [rules?.rules?.length ?? 0])}
          active={match}
          onPress={() => navigate('/rules')}
        />
      </div>
    </div>
  )
}

export default RuleCard
