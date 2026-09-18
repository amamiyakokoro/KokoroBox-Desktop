import { tr } from '../../../../shared/i18n'
import { Button, Tooltip } from '@heroui/react'
import { Meter } from '@heroui-v3/react'
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
import { SiderStatusCard } from './sider-surfaces'

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
    attributes,
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
        <Tooltip content={tr('Subscriptions')} placement="right">
          <Button
            size="sm"
            isIconOnly
            aria-label={tr('Subscriptions')}
            color={match ? 'primary' : 'default'}
            variant={match ? 'solid' : 'light'}
            onPress={() => navigate('/profiles')}
          >
            <TiFolder className="text-[20px]" />
          </Button>
        </Tooltip>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
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
            <Tooltip content={tr('Runtime configuration')} placement="top">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                aria-label={tr('Runtime configuration')}
                onPress={() => setShowRuntimeConfig(true)}
              >
                <CgLoadbarDoc className="text-lg" />
              </Button>
            </Tooltip>
            {info.type === 'remote' && (
              <Tooltip
                content={`${tr('Refresh')} · ${dayjs(info.updated).fromNow()}`}
                placement="top"
              >
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label={tr('Refresh')}
                  isDisabled={updating}
                  onPress={async () => {
                    setUpdating(true)
                    await addProfileItem(info)
                    setUpdating(false)
                  }}
                >
                  <IoMdRefresh className={`text-lg ${updating ? 'animate-spin' : ''}`} />
                </Button>
              </Tooltip>
            )}
          </>
        }
        details={
          info.type === 'remote' ? (
            extra ? (
              <div className="space-y-1.5">
                <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                  <span className="truncate text-foreground-500">
                    {calcTraffic(usage)} / {calcTraffic(total)}
                  </span>
                  <Tooltip content={dateLabel} placement="top">
                    <Button
                      size="sm"
                      variant="light"
                      className="h-6 min-w-0 px-1.5 text-xs text-foreground-500"
                      aria-label={dateLabel}
                      onPress={() =>
                        patchAppConfig({
                          profileDisplayDate: profileDisplayDate === 'expire' ? 'update' : 'expire'
                        })
                      }
                    >
                      {dateValue}
                    </Button>
                  </Tooltip>
                </div>
                <Meter aria-label={tr('Traffic usage')} maxValue={total} value={usage}>
                  <Meter.Track className="h-1.5 bg-default-200">
                    <Meter.Fill className="bg-primary" />
                  </Meter.Track>
                </Meter>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 text-xs text-foreground-500">
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
