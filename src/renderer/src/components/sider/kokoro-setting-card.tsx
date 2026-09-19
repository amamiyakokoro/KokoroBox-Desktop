import { tr } from '../../../../shared/i18n'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React from 'react'
import { MdManageAccounts } from 'react-icons/md'
import { useLocation, useNavigate } from 'react-router-dom'
import { SiderIconButton, SiderNavItem } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const KokoroSettingCard: React.FC<Props> = ({ iconOnly = false }) => {
  const { appConfig } = useAppConfig()
  const { kokoroCardStatus = 'col-span-2', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/kokoro')
  const {
    listeners,
    setNodeRef,
    transform: sortableTransform,
    transition,
    isDragging
  } = useSortable({ id: 'kokoro' })
  const transform = sortableTransform
    ? { x: sortableTransform.x, y: sortableTransform.y, scaleX: 1, scaleY: 1 }
    : null

  if (iconOnly) {
    return (
      <div className={`${kokoroCardStatus} kokoro-setting-card flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('Kokoro account and subscription')}
          placement="right"
          onPress={() => navigate('/kokoro')}
        >
          <MdManageAccounts className="text-[21px]" />
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
      className={`${kokoroCardStatus} kokoro-setting-card`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        className={isDragging && !disableAnimation ? 'scale-[0.98]' : undefined}
      >
        <SiderNavItem
          icon={<MdManageAccounts />}
          title={tr('Kokoro account and subscription')}
          active={match}
          onPress={() => navigate('/kokoro')}
        />
      </div>
    </div>
  )
}

export default KokoroSettingCard
