import { tr } from '../../../shared/i18n'
import BasePage from '@renderer/components/base/base-page'
import LogItem from '@renderer/components/logs/log-item'
import { ServiceLogMessage } from '@renderer/components/logs/service-log-message'
import { KokoSearchField } from '@renderer/components/base/koko-search-field'
import { KokoTabs } from '@renderer/components/base/base-controls'
import { KokoToolbar, KokoToolbarIconButton } from '@renderer/components/base/koko-toolbar'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LogContextMenu from '@renderer/components/logs/log-context-menu'
import LogRuleModal from '@renderer/components/logs/log-rule-modal'
import type { LogActionDetails } from '@renderer/components/logs/log-actions'
import { KokoSelect } from '@renderer/components/base/koko-form'
import { Virtuoso } from 'react-virtuoso'
import { IoLocationSharp } from 'react-icons/io5'
import { CgTrash } from 'react-icons/cg'

import { includesIgnoreCase } from '@renderer/utils/includes'
import {
  clearMihomoLogs,
  getMihomoLogs,
  type MihomoLogEntry,
  setMihomoLogMaxEntries,
  subscribeMihomoLogs
} from '@renderer/utils/mihomo-log-store'
import { Separator } from '@heroui/react'
import {
  clearAppRoutingLogs,
  getAppRoutingLogs,
  getServiceLogs,
  restartMihomoLogs
} from '@renderer/utils/ipc'
import type { AppRoutingLogEntry } from '../../../shared/app-routing-log'
import { diagnosticLogLevel, isDiagnosticLogVisible } from '../../../shared/diagnostic-log'
import {
  parseServiceLogs,
  type ServiceLogCursor,
  type ServiceLogEntry,
  type ServiceLogSnapshot
} from '../../../shared/service-log'
import { notify } from '@renderer/utils/notification'
import './management-surfaces.css'

const logLevelOrder: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warning: 2,
  info: 3,
  debug: 4
}

function isSameLogEntry(left: MihomoLogEntry, right: MihomoLogEntry): boolean {
  return (
    left.id === right.id &&
    left.seq === right.seq &&
    left.type === right.type &&
    left.payload === right.payload &&
    left.time === right.time
  )
}

function areSameLogEntries(left: MihomoLogEntry[], right: MihomoLogEntry[]): boolean {
  return (
    left.length === right.length && left.every((log, index) => isSameLogEntry(log, right[index]))
  )
}

function areSameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

const maxAnimatedFreshLogs = 24
const freshLogAnimationDurationMs = 360

const Logs: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { maxLogEntries = 500, realtimeLogLevel } = appConfig || {}
  const { 'log-level': logLevel = 'info' } = controledMihomoConfig || {}

  const [logs, setLogs] = useState<MihomoLogEntry[]>(() => getMihomoLogs())
  const [tab, setTab] = useState<'core' | 'routing' | 'service'>('core')
  const [routingLogs, setRoutingLogs] = useState<AppRoutingLogEntry[]>([])
  const [routingError, setRoutingError] = useState('')
  const routingRequest = useRef(0)
  const [serviceLogs, setServiceLogs] = useState<ServiceLogEntry[]>([])
  const [serviceError, setServiceError] = useState('')
  const [diagnosticLevelFilter, setDiagnosticLevelFilter] = useState<LogLevel>('info')
  const serviceRequest = useRef(0)
  const serviceSnapshot = useRef<ServiceLogSnapshot | undefined>(undefined)
  const clearedServiceLogs = useRef<ServiceLogCursor | undefined>(undefined)
  const [filter, setFilter] = useState('')
  const [trace, setTrace] = useState(true)
  const [freshLogIds, setFreshLogIds] = useState<string[]>([])
  const [context, setContext] = useState<{ log: ControllerLog; x: number; y: number }>()
  const [ruleDetails, setRuleDetails] = useState<LogActionDetails>()
  const closeContext = useCallback(() => setContext(undefined), [])
  const openContext = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent, log: ControllerLog) => {
      const rect = event.currentTarget.getBoundingClientRect()
      setContext({
        log: { ...log },
        x: 'clientX' in event ? event.clientX : rect.left + 16,
        y: 'clientY' in event ? event.clientY : rect.top + 16
      })
    },
    []
  )

  const freshLogTimerRef = useRef<number | null>(null)
  const hasHydratedLogsRef = useRef(false)
  const previousLogIdsRef = useRef<string[]>([])
  const activeLogLevelFilter =
    tab === 'core' ? (realtimeLogLevel ?? logLevel) : diagnosticLevelFilter
  const freshLogIdSet = useMemo(() => new Set(freshLogIds), [freshLogIds])
  const logsByLevel = useMemo(() => {
    if (activeLogLevelFilter === 'silent') return []
    return logs.filter((log) => logLevelOrder[log.type] <= logLevelOrder[activeLogLevelFilter])
  }, [logs, activeLogLevelFilter])
  const filteredLogs = useMemo(() => {
    if (filter === '') return logsByLevel
    return logsByLevel.filter((log) => {
      return includesIgnoreCase(log.payload, filter) || includesIgnoreCase(log.type, filter)
    })
  }, [logsByLevel, filter])
  const filteredRoutingLogs = useMemo(
    () =>
      routingLogs.filter(
        (log) =>
          isDiagnosticLogVisible(diagnosticLogLevel(log.level), diagnosticLevelFilter) &&
          includesIgnoreCase(log.message, filter)
      ),
    [routingLogs, filter, diagnosticLevelFilter]
  )
  const filteredServiceLogs = useMemo(
    () =>
      serviceLogs.filter(
        (log) =>
          isDiagnosticLogVisible(log.type, diagnosticLevelFilter) &&
          (includesIgnoreCase(log.payload, filter) || includesIgnoreCase(log.type, filter))
      ),
    [serviceLogs, filter, diagnosticLevelFilter]
  )

  const refreshServiceLogs = useCallback(async () => {
    const request = ++serviceRequest.current
    try {
      const snapshot = await getServiceLogs()
      if (request !== serviceRequest.current) return
      serviceSnapshot.current = snapshot
      setServiceLogs(parseServiceLogs(snapshot, clearedServiceLogs.current).slice(-maxLogEntries))
      setServiceError('')
    } catch (error) {
      if (request !== serviceRequest.current) return
      setServiceError(error instanceof Error ? error.message : String(error))
    }
  }, [maxLogEntries])

  const refreshRoutingLogs = useCallback(async () => {
    const request = ++routingRequest.current
    try {
      const entries = await getAppRoutingLogs()
      if (request !== routingRequest.current) return
      setRoutingLogs(entries)
      setRoutingError('')
    } catch (error) {
      if (request !== routingRequest.current) return
      setRoutingError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  useEffect(() => {
    if (tab !== 'routing') return
    let active = true
    let timer: number | undefined
    const update = async () => {
      await refreshRoutingLogs()
      if (active) timer = window.setTimeout(() => void update(), 2000)
    }
    void update()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
      routingRequest.current++
    }
  }, [tab, refreshRoutingLogs])

  useEffect(() => {
    if (tab !== 'service') return
    let active = true
    let timer: number | undefined
    const update = async () => {
      await refreshServiceLogs()
      if (active) timer = window.setTimeout(() => void update(), 2000)
    }
    void update()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
      serviceRequest.current++
    }
  }, [tab, refreshServiceLogs])

  const clearFreshLogTimer = (): void => {
    if (!freshLogTimerRef.current) return
    window.clearTimeout(freshLogTimerRef.current)
    freshLogTimerRef.current = null
  }

  useEffect(() => {
    return subscribeMihomoLogs((nextLogs) => {
      startTransition(() => {
        setLogs((prevLogs) => (areSameLogEntries(prevLogs, nextLogs) ? prevLogs : nextLogs))
      })
    })
  }, [])

  useEffect(() => {
    return () => {
      clearFreshLogTimer()
    }
  }, [])

  useEffect(() => {
    const currentLogIds = logs.map((log) => log.id)

    if (!hasHydratedLogsRef.current) {
      hasHydratedLogsRef.current = true
      previousLogIdsRef.current = currentLogIds
      return
    }

    if (currentLogIds.length === 0) {
      previousLogIdsRef.current = []
      clearFreshLogTimer()
      setFreshLogIds((prev) => (prev.length === 0 ? prev : []))
      return
    }

    const previousLogIdSet = new Set(previousLogIdsRef.current)
    const addedLogIds = currentLogIds.filter((id) => !previousLogIdSet.has(id))

    previousLogIdsRef.current = currentLogIds
    if (addedLogIds.length === 0) return

    const nextFreshLogIds = addedLogIds.slice(-maxAnimatedFreshLogs)
    setFreshLogIds((prev) => {
      return areSameIds(prev, nextFreshLogIds) ? prev : nextFreshLogIds
    })

    clearFreshLogTimer()
    freshLogTimerRef.current = window.setTimeout(() => {
      freshLogTimerRef.current = null
      setFreshLogIds((prev) => (prev.length === 0 ? prev : []))
    }, freshLogAnimationDurationMs)
  }, [logs])

  useEffect(() => {
    setMihomoLogMaxEntries(maxLogEntries)
  }, [maxLogEntries])

  return (
    <BasePage title={tr('Live logs')} contentClassName="logs-page overflow-y-hidden">
      <div className="flex h-full min-h-0 flex-col">
        <div className="no-scrollbar sticky top-0 z-40 overflow-x-auto bg-surface">
          <KokoToolbar aria-label={tr('Live logs')}>
            <KokoTabs
              ariaLabel={tr('Log source')}
              density="toolbar"
              options={[
                { id: 'core', label: tr('Core') },
                { id: 'routing', label: tr('App routing') },
                { id: 'service', label: tr('Service') }
              ]}
              selectedKey={tab}
              variant="secondary"
              onChange={(key) => {
                setTab(key === 'routing' || key === 'service' ? key : 'core')
                setFilter('')
                setContext(undefined)
              }}
            />
            <KokoSearchField
              className="min-w-20 flex-1 shrink"
              value={filter}
              aria-label={tr('Filter')}
              placeholder={tr('Filter')}
              onChangeValue={setFilter}
            />

            <KokoSelect
              aria-label={tr('Filter by log level')}
              className="w-24 shrink-0"
              density="toolbar"
              options={[
                { id: 'silent', label: tr('Silent') },
                { id: 'error', label: tr('Error') },
                { id: 'warning', label: tr('Warning') },
                { id: 'info', label: tr('Info') },
                { id: 'debug', label: tr('Debug') }
              ]}
              value={activeLogLevelFilter}
              variant="secondary"
              onChange={async (value) => {
                if (value === activeLogLevelFilter) return
                if (tab !== 'core') {
                  setDiagnosticLevelFilter(value as LogLevel)
                  return
                }

                try {
                  if (!(await patchAppConfig({ realtimeLogLevel: value as LogLevel }))) return
                  await restartMihomoLogs()
                } catch (error) {
                  notify(error, { variant: 'danger' })
                }
              }}
            />
            <KokoToolbarIconButton
              isActive={trace}
              label={trace ? tr('Stop following new logs') : tr('Follow new logs')}
              onPress={() => {
                setTrace((prev) => !prev)
              }}
            >
              <IoLocationSharp className="text-lg" />
            </KokoToolbarIconButton>
            <KokoToolbarIconButton
              label={tab === 'service' ? tr('Clear displayed logs') : tr('Clear logs')}
              tone="danger"
              isDisabled={
                (tab === 'routing' && (Boolean(routingError) || routingLogs.length === 0)) ||
                (tab === 'service' && (Boolean(serviceError) || serviceLogs.length === 0))
              }
              onPress={() => {
                if (tab === 'core') {
                  clearMihomoLogs()
                } else if (tab === 'service') {
                  const snapshot = serviceSnapshot.current
                  if (snapshot) {
                    clearedServiceLogs.current = { session: snapshot.session, end: snapshot.end }
                    setServiceLogs([])
                  }
                } else {
                  routingRequest.current++
                  void clearAppRoutingLogs()
                    .then(() => {
                      setRoutingLogs([])
                      setRoutingError('')
                      void refreshRoutingLogs()
                    })
                    .catch((error) => notify(error, { variant: 'danger' }))
                }
              }}
            >
              <CgTrash className="text-lg" />
            </KokoToolbarIconButton>
          </KokoToolbar>
          <Separator />
        </div>
        <div className="min-h-0 flex-1 bg-surface py-1">
          {tab === 'core' ? (
            <Virtuoso
              className="h-full pr-1"
              data={filteredLogs}
              initialTopMostItemIndex={
                filteredLogs.length > 0 ? filteredLogs.length - 1 : undefined
              }
              followOutput={trace && !context && !ruleDetails}
              computeItemKey={(_index, log) => log.id}
              itemContent={(i, log) => {
                return (
                  <LogItem
                    index={i}
                    animateOnMount={freshLogIdSet.has(log.id)}
                    time={log.time}
                    type={log.type}
                    payload={log.payload}
                    onOpenMenu={openContext}
                  />
                )
              }}
            />
          ) : tab === 'service' ? (
            serviceError ? (
              <div role="alert" className="p-5 text-sm text-danger">
                {serviceError}
              </div>
            ) : serviceLogs.length === 0 ? (
              <div className="p-5 text-sm text-muted">{tr('No service logs yet.')}</div>
            ) : (
              <Virtuoso
                className="h-full pr-1"
                data={filteredServiceLogs}
                initialTopMostItemIndex={
                  filteredServiceLogs.length > 0 ? filteredServiceLogs.length - 1 : undefined
                }
                followOutput={trace && !context && !ruleDetails}
                computeItemKey={(_index, log) => log.id}
                itemContent={(index, log) => (
                  <LogItem
                    index={index}
                    time={log.time}
                    type={log.type}
                    payload={log.payload}
                    content={log.fields ? <ServiceLogMessage entry={log} /> : undefined}
                    onOpenMenu={openContext}
                  />
                )}
              />
            )
          ) : routingError ? (
            <div role="alert" className="p-5 text-sm text-danger">
              {routingError}
            </div>
          ) : routingLogs.length === 0 ? (
            <div className="p-5 text-sm text-muted">
              {tr(
                'No application routing logs yet. Enable diagnostic logging in Application routing settings.'
              )}
            </div>
          ) : (
            <Virtuoso
              className="h-full pr-1"
              data={filteredRoutingLogs}
              initialTopMostItemIndex={
                filteredRoutingLogs.length > 0 ? filteredRoutingLogs.length - 1 : undefined
              }
              followOutput={trace && !context && !ruleDetails}
              computeItemKey={(_index, log) => log.id}
              itemContent={(index, log) => (
                <LogItem
                  index={index}
                  time={log.time}
                  type={diagnosticLogLevel(log.level)}
                  payload={log.message}
                  onOpenMenu={openContext}
                />
              )}
            />
          )}
        </div>
      </div>
      {context && <LogContextMenu {...context} onClose={closeContext} onRule={setRuleDetails} />}
      {ruleDetails && (
        <LogRuleModal details={ruleDetails} onClose={() => setRuleDetails(undefined)} />
      )}
    </BasePage>
  )
}

export default Logs
