import { tr } from '../../../../shared/i18n'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { LuGroup } from 'react-icons/lu'
import { useLocation, useNavigate } from 'react-router-dom'
import { useGroups } from '@renderer/hooks/use-groups'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import React from 'react'
import { getOutboundModeLabel } from './outbound-mode'
import { SiderIconButton, SiderStatusCard } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const ProxyCard: React.FC<Props> = ({ iconOnly }) => {
  const { appConfig } = useAppConfig()
  const { proxyCardStatus = 'col-span-2', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/proxies')
  const { groups = [] } = useGroups()
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { mode = 'rule' } = controledMihomoConfig || {}
  const {
    listeners,
    setNodeRef,
    transform: sortableTransform,
    transition,
    isDragging
  } = useSortable({ id: 'proxy' })
  const transform = sortableTransform
    ? { x: sortableTransform.x, y: sortableTransform.y, scaleX: 1, scaleY: 1 }
    : null
  const globalGroup = groups.find((group) => group.name.toUpperCase() === 'GLOBAL')
  const modeLabel = getOutboundModeLabel(mode)
  const modeStatus =
    mode === 'global'
      ? globalGroup?.now
      : mode === 'rule'
        ? tr('{0} groups', [groups.length])
        : undefined
  const cardLabel = `${tr('Proxy')} — ${modeLabel}`

  if (iconOnly) {
    return (
      <div className={`${proxyCardStatus} flex justify-center`}>
        <SiderIconButton
          active={match}
          label={cardLabel}
          placement="right"
          onPress={() => navigate('/proxies')}
        >
          <LuGroup className="text-[20px]" />
        </SiderIconButton>
      </div>
    )
  }
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
      className={`${proxyCardStatus} proxy-card ${isDragging && !disableAnimation ? 'scale-[0.98]' : ''}`}
    >
      <SiderStatusCard
        icon={<LuGroup />}
        title={tr('Proxy')}
        description={modeLabel}
        status={modeStatus}
        metadataSeparator={mode === 'global' ? '→' : '·'}
        active={match}
        onPress={() => navigate('/proxies')}
      />
    </div>
  )
}

export default ProxyCard
