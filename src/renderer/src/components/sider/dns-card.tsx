import { Button, Tooltip } from '@heroui/react'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { LuServer } from 'react-icons/lu'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React from 'react'
import { tr } from '../../../../shared/i18n'
import { SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}
const settingsPath = '/settings?section=network&panel=dns'

const DNSCard: React.FC<Props> = (props) => {
  const { appConfig } = useAppConfig()
  const { iconOnly } = props
  const {
    dnsCardStatus = 'col-span-1',
    controlDns = true,
    disableAnimation = false
  } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match =
    location.pathname.includes('/dns') ||
    (location.pathname.includes('/settings') &&
      location.search.includes('section=network') &&
      location.search.includes('panel=dns'))
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { dns } = controledMihomoConfig || {}
  const { enable = true } = dns || {}
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'dns'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  if (iconOnly) {
    return (
      <div className={`${dnsCardStatus} ${!controlDns ? 'hidden' : ''} flex justify-center`}>
        <Tooltip content="DNS" placement="right">
          <Button
            size="sm"
            isIconOnly
            color={match ? 'primary' : 'default'}
            variant={match ? 'solid' : 'light'}
            onPress={() => {
              navigate(settingsPath)
            }}
          >
            <LuServer className="text-[20px]" />
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
      className={`${dnsCardStatus} ${!controlDns ? 'hidden' : ''} dns-card`}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<LuServer />}
          title="DNS"
          status={enable ? tr('Enabled') : tr('Disabled')}
          statusTone={enable ? 'success' : 'default'}
          active={match}
          onPress={() => navigate(settingsPath)}
        />
      </div>
    </div>
  )
}

export default DNSCard
