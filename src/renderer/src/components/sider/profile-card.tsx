import { tr } from '../../../../shared/i18n'
import { Button, Meter, Tooltip } from '@heroui/react'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useLocation, useNavigate } from 'react-router-dom'
import { calcTraffic } from '@renderer/utils/calc'
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
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    profileCardStatus = 'col-span-2',
    profileDisplayDate = 'expire',
    disableAnimation = false
  } = appConfig || {}
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

  const extra = info.extra
  const usage = (extra?.upload ?? 0) + (extra?.download ?? 0)
  const total = extra?.total ?? 0
  const dateLabel = profileDisplayDate === 'expire' ? tr('Expiration') : tr('Last updated')
  const dateValue =
    profileDisplayDate === 'expire'
      ? extra?.expire
        ? dayjs.unix(extra.expire).format('YYYY-MM-DD')
        : tr('No expiration')
      : dayjs(info.updated).fromNow()

  if (iconOnly) {
    return (
      <div className={`${profileCardStatus} flex justify-center`}>
        <SiderIconButton
          active={match}
          label={tr('Subscriptions')}
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
        title={info.name}
        description={tr('Subscriptions')}
        status={info.type === 'remote' ? tr('Remote') : tr('Local')}
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
        details={
          info.type === 'remote' ? (
            extra ? (
              <div className="space-y-1.5">
                <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted">
                    {calcTraffic(usage)} / {calcTraffic(total)}
                  </span>
                  <Tooltip delay={0}>
                    <Tooltip.Trigger className="inline-flex min-w-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 min-w-0 px-1.5 text-xs text-muted"
                        aria-label={dateLabel}
                        onPress={() =>
                          patchAppConfig({
                            profileDisplayDate:
                              profileDisplayDate === 'expire' ? 'update' : 'expire'
                          })
                        }
                      >
                        {dateValue}
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content placement="top">{dateLabel}</Tooltip.Content>
                  </Tooltip>
                </div>
                <Meter aria-label={tr('Traffic usage')} maxValue={total} value={usage}>
                  <Meter.Track className="h-1.5 bg-surface-secondary">
                    <Meter.Fill className="bg-accent" />
                  </Meter.Track>
                </Meter>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>{tr('Last updated')}</span>
                <span>{dayjs(info.updated).fromNow()}</span>
              </div>
            )
          ) : undefined
        }
      />
    </div>
  )
}

export default ProfileCard
