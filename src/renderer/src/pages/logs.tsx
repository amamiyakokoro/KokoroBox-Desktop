import { tr } from '../../../shared/i18n'
import BasePage from '@renderer/components/base/base-page'
import LogItem from '@renderer/components/logs/log-item'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { KokoSelect, KokoTextField as Input } from '@renderer/components/base/koko-form'
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
import { Button, Separator, Tooltip } from '@heroui/react'
import { restartMihomoLogs } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'

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
  const [filter, setFilter] = useState('')
  const [trace, setTrace] = useState(true)
  const [freshLogIds, setFreshLogIds] = useState<string[]>([])

  const freshLogTimerRef = useRef<number | null>(null)
  const hasHydratedLogsRef = useRef(false)
  const previousLogIdsRef = useRef<string[]>([])
  const activeLogLevelFilter = realtimeLogLevel ?? logLevel
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
    <BasePage title={tr('Live logs')} contentClassName="overflow-y-hidden">
      <div className="flex h-full min-h-0 flex-col">
        <div className="sticky top-0 z-40">
          <div className="flex w-full items-center gap-2 p-2">
            <Input
              size="sm"
              value={filter}
              placeholder={tr('Filter')}
              isClearable
              onValueChange={setFilter}
            />
            <KokoSelect
              aria-label={tr('Filter by log level')}
              className="w-24 shrink-0"
              density="compact"
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

                try {
                  await patchAppConfig({ realtimeLogLevel: value as LogLevel })
                  await restartMihomoLogs()
                } catch (error) {
                  notify(error, { variant: 'danger' })
                }
              }}
            />
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <Button
                  size="sm"
                  isIconOnly
                  variant={trace ? 'primary' : 'outline'}
                  aria-label={trace ? tr('Stop following new logs') : tr('Follow new logs')}
                  onPress={() => {
                    setTrace((prev) => !prev)
                  }}
                >
                  <IoLocationSharp className="text-lg" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                {trace ? tr('Stop following new logs') : tr('Follow new logs')}
              </Tooltip.Content>
            </Tooltip>
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <Button
                  size="sm"
                  isIconOnly
                  variant="ghost"
                  className="text-danger"
                  aria-label={tr('Clear logs')}
                  onPress={() => {
                    clearMihomoLogs()
                  }}
                >
                  <CgTrash className="text-lg" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>{tr('Clear logs')}</Tooltip.Content>
            </Tooltip>
          </div>
          <Separator />
        </div>
        <div className="min-h-0 flex-1 py-1">
          <Virtuoso
            className="h-full pr-1"
            data={filteredLogs}
            initialTopMostItemIndex={filteredLogs.length > 0 ? filteredLogs.length - 1 : undefined}
            followOutput={trace}
            computeItemKey={(_index, log) => log.id}
            itemContent={(i, log) => {
              return (
                <LogItem
                  index={i}
                  animateOnMount={freshLogIdSet.has(log.id)}
                  time={log.time}
                  type={log.type}
                  payload={log.payload}
                />
              )
            }}
          />
        </div>
      </div>
    </BasePage>
  )
}

export default Logs
