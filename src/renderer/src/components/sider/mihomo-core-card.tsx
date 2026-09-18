import { tr } from '../../../../shared/i18n'
import { Button, Tooltip } from '@heroui/react'
import { calcTraffic } from '@renderer/utils/calc'
import { mihomoVersion, restartCore } from '@renderer/utils/ipc'
import React, { useEffect, useState } from 'react'
import { IoMdRefresh } from 'react-icons/io'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLocation, useNavigate } from 'react-router-dom'
import PubSub from 'pubsub-js'
import useSWR from 'swr'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { LuCpu } from 'react-icons/lu'
import { notify } from '@renderer/utils/notification'
import { SiderStatusCard } from './sider-surfaces'
import { normalizeCoreVersion } from './core-version'

interface Props {
  iconOnly?: boolean
}

const settingsPath = '/settings?section=network&panel=mihomo'

const MihomoCoreCard: React.FC<Props> = ({ iconOnly }) => {
  const { appConfig } = useAppConfig()
  const { mihomoCoreCardStatus = 'col-span-2', disableAnimation = false } = appConfig || {}
  const {
    data: version,
    error: versionError,
    mutate
  } = useSWR('mihomoVersion', mihomoVersion, {
    errorRetryInterval: 200,
    errorRetryCount: 10
  })
  const location = useLocation()
  const navigate = useNavigate()
  const match =
    location.pathname.includes('/mihomo') ||
    (location.pathname.includes('/settings') &&
      location.search.includes('section=network') &&
      location.search.includes('panel=mihomo'))
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: sortableTransform,
    transition,
    isDragging
  } = useSortable({ id: 'mihomo' })
  const transform = sortableTransform
    ? { x: sortableTransform.x, y: sortableTransform.y, scaleX: 1, scaleY: 1 }
    : null
  const [mem, setMem] = useState(0)
  const [restarting, setRestarting] = useState(false)
  const coreVersion = normalizeCoreVersion(version?.version)
  const versionLabel = versionError
    ? tr('Needs attention')
    : version
      ? (coreVersion ?? tr('Unknown'))
      : tr('Loading')

  useEffect(() => {
    const token = PubSub.subscribe('mihomo-core-changed', () => {
      mutate()
    })
    const unsubscribeMihomoMemory = window.electron.ipcRenderer.on(
      'mihomoMemory',
      (_e, info: ControllerMemory) => {
        setMem(info.inuse)
      }
    )
    const unsubscribeCoreStarted = window.electron.ipcRenderer.on('core-started', () => {
      mutate()
    })
    return (): void => {
      PubSub.unsubscribe(token)
      unsubscribeMihomoMemory()
      unsubscribeCoreStarted()
    }
  }, [])

  if (iconOnly) {
    return (
      <div className={`${mihomoCoreCardStatus} flex justify-center`}>
        <Tooltip content={tr('Mihomo settings')} placement="right">
          <Button
            size="sm"
            isIconOnly
            aria-label={tr('Mihomo settings')}
            color={match ? 'primary' : 'default'}
            variant={match ? 'solid' : 'light'}
            onPress={() => navigate(settingsPath)}
          >
            <LuCpu className="text-[20px]" />
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
      className={`${mihomoCoreCardStatus} mihomo-core-card ${isDragging && !disableAnimation ? 'scale-[0.98]' : ''}`}
    >
      <SiderStatusCard
        icon={<LuCpu />}
        title={tr('Core')}
        description={versionLabel}
        status={version ? `${tr('Memory')} ${calcTraffic(mem)}` : undefined}
        statusTone={versionError ? 'danger' : 'default'}
        prioritizeDescription
        active={match}
        onPress={() => navigate(settingsPath)}
        actions={
          <Tooltip content={tr('Restart')}>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              isDisabled={restarting}
              aria-label={tr('Restart')}
              onPress={async () => {
                try {
                  setRestarting(true)
                  await restartCore()
                  await new Promise((resolve) => {
                    setTimeout(resolve, 2000)
                  })
                } catch (error) {
                  notify(error, { variant: 'danger' })
                } finally {
                  setRestarting(false)
                  void mutate()
                }
              }}
            >
              <IoMdRefresh className={restarting ? 'animate-spin' : undefined} />
            </Button>
          </Tooltip>
        }
      />
    </div>
  )
}

export default MihomoCoreCard
