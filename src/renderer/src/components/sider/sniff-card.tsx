import { tr } from '../../../../shared/i18n'
import { RiScan2Fill } from 'react-icons/ri'
import { useLocation, useNavigate } from 'react-router-dom'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React from 'react'
import { SiderIconButton, SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}
const settingsPath = '/settings?section=network&panel=sniffer'

const SniffCard: React.FC<Props> = (props) => {
  const { appConfig } = useAppConfig()
  const { iconOnly } = props
  const {
    sniffCardStatus = 'col-span-1',
    controlSniff = true,
    disableAnimation = false
  } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match =
    location.pathname.includes('/sniffer') ||
    (location.pathname.includes('/settings') &&
      location.search.includes('section=network') &&
      location.search.includes('panel=sniffer'))
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { sniffer } = controledMihomoConfig || {}
  const { enable } = sniffer || {}
  const {
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'sniff'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  if (iconOnly) {
    return (
      <div className={`${sniffCardStatus} ${!controlSniff ? 'hidden' : ''} flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('Sniffing')}
          placement="right"
          onPress={() => navigate(settingsPath)}
        >
          <RiScan2Fill className="text-[20px]" />
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
      className={`${sniffCardStatus} ${!controlSniff ? 'hidden' : ''} sniff-card`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<RiScan2Fill />}
          title={tr('Sniffing')}
          status={enable ? tr('Enabled') : tr('Disabled')}
          statusTone={enable ? 'success' : 'danger'}
          active={match}
          onPress={() => navigate(settingsPath)}
        />
      </div>
    </div>
  )
}

export default SniffCard
