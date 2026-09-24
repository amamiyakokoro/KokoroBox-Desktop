import { tr } from '../../../../shared/i18n'
import { Chip } from '@heroui/react'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useLocation, useNavigate } from 'react-router-dom'
import { CgLoadbarDoc } from 'react-icons/cg'
import { IoMdRefresh } from 'react-icons/io'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import dayjs from 'dayjs'
import React, { useState } from 'react'
import ConfigViewer from './config-viewer'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { TiFolder } from 'react-icons/ti'
import { SiderIconButton, SiderStatusCard } from './sider-surfaces'

dayjs.extend(relativeTime)

interface Props {
  iconOnly?: boolean
}

const ProfileCard: React.FC<Props> = ({ iconOnly }) => {
  const { appConfig } = useAppConfig()
  const { profileCardStatus = 'col-span-2', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/profiles')
  const [updating, setUpdating] = useState(false)
  const [showRuntimeConfig, setShowRuntimeConfig] = useState(false)
  const { profileConfig, addProfileItem } = useProfileConfig()
  const { current, items } = profileConfig ?? {}
  const {
    listeners,
    setNodeRef,
    transform: sortableTransform,
    transition,
    isDragging
  } = useSortable({ id: 'profile' })
  const transform = sortableTransform
    ? { x: sortableTransform.x, y: sortableTransform.y, scaleX: 1, scaleY: 1 }
    : null
  const info = items?.find((item) => item.id === current) ?? {
    id: 'default',
    type: 'local',
    name: tr('Blank profile')
  }
  const isKokoroProfile = info.type === 'remote' && Boolean(info.kokoro)

  if (iconOnly) {
    return (
      <div className={`${profileCardStatus} flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('Subscription')}
          placement="right"
          onPress={() => navigate('/profiles')}
        >
          <TiFolder className="text-[20px]" />
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
      className={`${profileCardStatus} profile-card ${isDragging && !disableAnimation ? 'scale-[0.98]' : ''}`}
    >
      {showRuntimeConfig && <ConfigViewer onClose={() => setShowRuntimeConfig(false)} />}
      <SiderStatusCard
        icon={<TiFolder />}
        title={tr('Subscription')}
        status={
          isKokoroProfile ? (
            <Chip
              className="shrink-0"
              color="accent"
              size="sm"
              title={tr('Kokoro subscription')}
              variant="soft"
            >
              Kokoro
            </Chip>
          ) : info.type === 'remote' ? (
            tr('Remote')
          ) : (
            tr('Local')
          )
        }
        active={match}
        onPress={() => navigate('/profiles')}
        actions={
          <>
            <SiderIconButton
              label={tr('Runtime configuration')}
              onPress={() => setShowRuntimeConfig(true)}
            >
              <CgLoadbarDoc className="text-lg" />
            </SiderIconButton>
            {info.type === 'remote' && (
              <SiderIconButton
                isDisabled={updating}
                label={tr('Refresh')}
                tooltip={`${tr('Refresh')} · ${dayjs(info.updated).fromNow()}`}
                onPress={async () => {
                  setUpdating(true)
                  await addProfileItem(info)
                  setUpdating(false)
                }}
              >
                <IoMdRefresh className={`text-lg ${updating ? 'animate-spin' : ''}`} />
              </SiderIconButton>
            )}
          </>
        }
      />
    </div>
  )
}

export default ProfileCard
