import { tr } from '../../../../shared/i18n'
import { Button, Tooltip } from '@heroui/react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { LuGroup } from 'react-icons/lu'
import { useLocation, useNavigate } from 'react-router-dom'
import { useGroups } from '@renderer/hooks/use-groups'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React from 'react'
import { SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const ProxyCard: React.FC<Props> = (props) => {
  const { appConfig } = useAppConfig()
  const { iconOnly } = props
  const { proxyCardStatus = 'col-span-2', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/proxies')
  const { groups = [] } = useGroups()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'proxy'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const primaryGroup = groups.find((group) => group.name.toUpperCase() === 'GLOBAL') ?? groups[0]

  if (iconOnly) {
    return (
      <div className={`${proxyCardStatus} flex justify-center`}>
        <Tooltip content={tr('Proxy groups')} placement="right">
          <Button
            size="sm"
            isIconOnly
            color={match ? 'primary' : 'default'}
            variant={match ? 'solid' : 'light'}
            onPress={() => {
              navigate('/proxies')
            }}
          >
            <LuGroup className="text-[20px]" />
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
      className={`${proxyCardStatus} proxy-card`}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<LuGroup />}
          title={tr('Proxy groups')}
          description={primaryGroup?.name ?? tr('{0} groups', [groups.length])}
          status={primaryGroup?.now}
          active={match}
          onPress={() => navigate('/proxies')}
        />
      </div>
    </div>
  )
}

export default ProxyCard
