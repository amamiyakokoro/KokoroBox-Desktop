import { tr } from '../../../../shared/i18n'
import { Button, Tooltip } from '@heroui/react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React, { useEffect } from 'react'
import { MdOutlineAppShortcut } from 'react-icons/md'
import { useLocation, useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import { getAppRoutingConfig, getAppRoutingStatus } from '@renderer/utils/ipc'
import {
  getAppRoutingStatusLabel,
  getAppRoutingStatusMessage
} from '@renderer/utils/app-routing-status'
import { isAppRoutingRuleEffectivelyEnabled } from '../../../../shared/app-routing'
import { SiderStatusCard } from './sider-surfaces'

interface Props {
  iconOnly?: boolean
}

const AppRoutingCard: React.FC<Props> = ({ iconOnly = false }) => {
  const { appConfig } = useAppConfig()
  const { appRoutingCardStatus = 'col-span-2', disableAnimation = false } = appConfig || {}
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.includes('/app-routing')
  const { data: config, mutate: mutateConfig } = useSWR(
    'sidebarAppRoutingConfig',
    getAppRoutingConfig,
    { refreshInterval: 5000 }
  )
  const { data: status, mutate: mutateStatus } = useSWR(
    'sidebarAppRoutingStatus',
    getAppRoutingStatus,
    { refreshInterval: 5000 }
  )
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: sortableTransform,
    transition,
    isDragging
  } = useSortable({ id: 'app-routing' })
  const transform = sortableTransform
    ? { x: sortableTransform.x, y: sortableTransform.y, scaleX: 1, scaleY: 1 }
    : null

  useEffect(
    () =>
      window.electron.ipcRenderer.on(
        'app-routing-status-changed',
        (_event, nextStatus: AppRoutingStatus) => {
          void mutateStatus(nextStatus, { revalidate: false })
          void mutateConfig()
        }
      ),
    [mutateConfig, mutateStatus]
  )

  const enabledRuleCount = config
    ? config.rules.filter((rule) => isAppRoutingRuleEffectivelyEnabled(config, rule)).length
    : 0
  const runtimeLabel = status
    ? getAppRoutingStatusLabel(status)
    : config?.enabled
      ? tr('Loading')
      : tr('Disabled')
  const statusTone =
    status?.state === 'running'
      ? ('success' as const)
      : status?.state === 'degraded'
        ? ('warning' as const)
        : status?.state === 'error'
          ? ('danger' as const)
          : ('default' as const)
  const statusMessage = getAppRoutingStatusMessage(
    status?.message,
    status?.protectedApplicationCount
  )
  const attentionMessage = status?.needsUserApproval
    ? tr('Network Extension approval required')
    : status && ['degraded', 'error'].includes(status.state)
      ? statusMessage
      : undefined

  if (iconOnly) {
    return (
      <div className={`${appRoutingCardStatus} app-routing-card flex justify-center`}>
        <Tooltip content={tr('Application routing')} placement="right">
          <Button
            size="sm"
            isIconOnly
            aria-label={tr('Application routing')}
            color={match ? 'primary' : 'default'}
            variant={match ? 'solid' : 'light'}
            onPress={() => navigate('/app-routing')}
          >
            <MdOutlineAppShortcut className="text-[21px]" />
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
      className={`${appRoutingCardStatus} app-routing-card ${isDragging && !disableAnimation ? 'scale-[0.98]' : ''}`}
    >
      <SiderStatusCard
        icon={<MdOutlineAppShortcut />}
        title={tr('Application routing')}
        description={tr('{0} applications', [enabledRuleCount])}
        status={runtimeLabel}
        statusTone={statusTone}
        active={match}
        onPress={() => navigate('/app-routing')}
        details={
          attentionMessage ? (
            <p
              role="status"
              className={`line-clamp-2 text-xs leading-4 ${status?.state === 'error' ? 'text-danger-600 dark:text-danger-400' : 'text-warning-600 dark:text-warning-400'}`}
              title={attentionMessage}
            >
              {attentionMessage}
            </p>
          ) : undefined
        }
      />
    </div>
  )
}

export default AppRoutingCard
