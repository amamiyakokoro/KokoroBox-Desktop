import { useAppConfig } from '@renderer/hooks/use-app-config'
import { Button } from '@heroui/react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useSWRConfig } from 'swr'
import { useRuntimeRecovery } from '@renderer/hooks/use-runtime-recovery'
import { useNavigate } from 'react-router-dom'
import {
  applyRecoveryPreferences,
  buildRuntimeRecoveryGuidance,
  recoveryActionLabel,
  type RecoveryAction
} from '../../../../shared/runtime-recovery'
import type {
  DiagnosticAction,
  SystemProxyDiagnostics
} from '../../../../shared/system-proxy-diagnostics'
import {
  openAppRoutingSystemSettings,
  openServiceSystemSettings,
  refreshAppRoutingStatus,
  restartCore,
  repairAppRoutingFirewall,
  relaunchApp
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import {
  repairServiceAndPromptRestart,
  useServiceRepairState
} from '@renderer/utils/service-repair'
import { RecoveryGuidance } from './recovery-guidance'
import { systemCoreOnlyBuild } from '../../../../shared/build-flags'
import { isAppRoutingRuleEffectivelyEnabled } from '../../../../shared/app-routing'
import { tr } from '../../../../shared/i18n'
const DiagnosticsModal = lazy(() => import('../sysproxy/system-proxy-diagnostics-modal'))
const diagnosticActions = new Set<RecoveryAction>([
  'start-core',
  'restart-core',
  'enable-system-proxy',
  'restore-system-proxy',
  'restore-bootstrap-dns'
])

export default function RuntimeRecoveryPanel({
  routingConfig,
  serviceVersion,
  routingStatus,
  diagnostics,
  onDiagnostics,
  busy: parentBusy = false
}: {
  routingConfig?: AppRoutingConfig
  serviceVersion?: string
  routingStatus?: AppRoutingStatus
  diagnostics?: SystemProxyDiagnostics
  onDiagnostics?: (action?: DiagnosticAction) => Promise<void>
  busy?: boolean
}) {
  const { data: snapshot, error, mutate } = useRuntimeRecovery()
  const { appConfig } = useAppConfig()
  const { mutate: mutateCache } = useSWRConfig()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [openDiagnostics, setOpenDiagnostics] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  const { repairing, restartRequired } = useServiceRepairState()
  useEffect(() => {
    mounted.current = true
    const refresh = () => {
      void mutate()
    }
    const removeStart = window.electron.ipcRenderer.on('core-started', refresh)
    const removeStop = window.electron.ipcRenderer.on('core-stopped', refresh)
    const removeRouting = window.electron.ipcRenderer.on(
      'app-routing-status-changed',
      (_event, status: AppRoutingStatus) => {
        void mutate(
          (current) =>
            current ? { ...current, routing: { ...current.routing, status } } : current,
          { revalidate: false }
        )
      }
    )
    return () => {
      mounted.current = false
      removeStart()
      removeStop()
      removeRouting()
    }
  }, [mutate])
  const activeRules = routingConfig?.rules.filter((rule) =>
    isAppRoutingRuleEffectivelyEnabled(routingConfig, rule)
  )
  const hasRules = !!activeRules?.length
  const requiresProxy = !!activeRules?.some((rule) => rule.action === 'proxy')
  useEffect(() => {
    void mutate()
  }, [
    appConfig?.corePermissionMode,
    appConfig?.sysProxy.enable,
    appConfig?.autoSetDNSMode,
    routingConfig?.enabled,
    hasRules,
    requiresProxy,
    mutate
  ])
  const recheck = async () => {
    await refreshAppRoutingStatus()
    await Promise.all([
      mutate(),
      mutateCache('sidebarAppRoutingStatus'),
      mutateCache('sidebarAppRoutingConfig')
    ])
  }
  const run = async (action: RecoveryAction) => {
    if (pending.current || parentBusy || repairing) return
    pending.current = true
    setBusy(true)
    try {
      if (['start-core', 'restart-core', 'repair-service', 'repair-firewall'].includes(action)) {
        const latest = await mutate()
        if (
          !latest ||
          !buildRuntimeRecoveryGuidance(latest, {
            diagnostics,
            restartRequired,
            serviceRepairSupported: !systemCoreOnlyBuild
          }).issue?.actions.includes(action)
        )
          return
      }
      if (onDiagnostics && (action === 'run-diagnostics' || diagnosticActions.has(action))) {
        await onDiagnostics(action === 'run-diagnostics' ? undefined : (action as DiagnosticAction))
        await mutate()
        return
      }
      switch (action) {
        case 'run-diagnostics':
          setOpenDiagnostics(true)
          return
        case 'check-again':
          if (onDiagnostics) await onDiagnostics()
          await recheck()
          return
        case 'open-extension-settings':
          await openAppRoutingSystemSettings()
          await mutate()
          return
        case 'open-service-settings':
          if (window.api.platform === 'darwin') await openServiceSystemSettings()
          else navigate('/settings?section=core&panel=runtime')
          return
        case 'repair-service':
          await repairServiceAndPromptRestart({ initializeRunningService: true })
          break
        case 'repair-firewall':
          await repairAppRoutingFirewall()
          break
        case 'start-core':
        case 'restart-core':
          await restartCore()
          break
        case 'restart-app':
          await relaunchApp()
          return
        case 'open-profiles':
          navigate('/profiles')
          return
        case 'open-routing':
          navigate('/app-routing')
          return
        case 'open-core-settings':
          navigate('/settings?section=core&panel=mihomo')
          return
        case 'open-app-settings':
          navigate('/settings?section=about')
          return
        case 'view-logs':
          navigate('/logs')
          return
        default:
          setOpenDiagnostics(true)
          return
      }
      await recheck()
    } catch (failure) {
      notify(failure, { variant: 'danger' })
      await mutate().catch(() => {})
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const guidance =
    snapshot && !error
      ? buildRuntimeRecoveryGuidance(
          applyRecoveryPreferences(snapshot, appConfig, routingConfig, routingStatus),
          { diagnostics, restartRequired, serviceRepairSupported: !systemCoreOnlyBuild }
        )
      : undefined
  return (
    <>
      {openDiagnostics && (
        <Suspense fallback={null}>
          <DiagnosticsModal onClose={() => setOpenDiagnostics(false)} />
        </Suspense>
      )}
      {guidance ? (
        <RecoveryGuidance
          guidance={guidance}
          serviceVersion={serviceVersion}
          busy={busy || parentBusy || repairing}
          onAction={(action) => {
            void run(action)
          }}
        />
      ) : (
        <section
          aria-label={tr('Status and recovery')}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-xs text-muted">
            {error ? tr('Runtime status could not be confirmed') : tr('Checking runtime status...')}
          </p>
          {error && (
            <div className="flex flex-wrap gap-2">
              {(['check-again', 'run-diagnostics', 'view-logs'] as RecoveryAction[]).map(
                (action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant="secondary"
                    isDisabled={busy || parentBusy || repairing}
                    onPress={() => {
                      void run(action)
                    }}
                  >
                    {recoveryActionLabel(action)}
                  </Button>
                )
              )}
            </div>
          )}
        </section>
      )}
    </>
  )
}
