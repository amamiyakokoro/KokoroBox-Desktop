import { tr } from '../../../../shared/i18n'
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
import { SiderIconButton, SiderStatusCard } from './sider-surfaces'
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
  const originalVersion = coreVersion ? version?.version.trim() : undefined
  const versionLabel = versionError
    ? tr('Needs attention')
    : version
      ? (coreVersion ?? tr('Unknown'))
      : tr('Loading')
  const memoryLabel = calcTraffic(mem)

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
        <SiderIconButton
          active={match}
          label={tr('Mihomo settings')}
          placement="right"
          onPress={() => navigate(settingsPath)}
        >
          <LuCpu className="text-[20px]" />
        </SiderIconButton>
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
        descriptionTitle={originalVersion}
        status={version ? memoryLabel : undefined}
        statusTitle={version ? `${tr('Memory')} ${memoryLabel}` : undefined}
        statusTone={versionError ? 'danger' : 'default'}
        prioritizeDescription
        active={match}
        onPress={() => navigate(settingsPath)}
        actions={
          <SiderIconButton
            isDisabled={restarting}
            label={tr('Restart')}
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
          </SiderIconButton>
        }
      />
    </div>
  )
}

export default MihomoCoreCard
