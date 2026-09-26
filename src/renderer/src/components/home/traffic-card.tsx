import { Surface } from '@heroui/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { LuArrowDown, LuArrowUp } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import { tr } from '../../../../shared/i18n'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useOverviewTraffic } from '@renderer/hooks/use-overview-traffic'
import {
  OverviewTrafficChart,
  overviewTrafficRangeSeconds,
  overviewTrafficState
} from './overview-traffic-chart'
import {
  createConnectionCounterResetState,
  nextConnectionCounterBaseline,
  withConnectionSpeeds
} from '../connections/connection-speeds'
import { TopActiveAppRow, metadataForTopActiveApp } from './top-active-app'
import {
  OverviewConnectionAction,
  overviewConnectionLabel,
  OverviewStat,
  OverviewTrafficRate,
  formatOverviewBytes
} from './overview-parts'
import {
  loadApplicationMetadata,
  type ApplicationMetadata
} from '@renderer/utils/application-metadata'
import {
  connectionActivityFreshnessMs,
  displayedTopApplication,
  hasFreshConnectionActivity,
  parseRememberedTopApplication,
  rememberedTopApplicationStorageKey,
  rememberTopApplication,
  type RememberedTopApplication,
  topActiveApplication
} from '@renderer/utils/home-connections'
import { platform } from '@renderer/utils/init'

interface Props {
  hasActiveBackground: boolean
  cardOpacity: number
  runtimeStopped: boolean
}

export const OverviewTrafficCard = memo(function OverviewTrafficCard({
  hasActiveBackground,
  cardOpacity,
  runtimeStopped
}: Props) {
  const { appConfig } = useAppConfig()
  const { history, rates, now: trafficNow } = useOverviewTraffic()
  const [connections, setConnections] = useState<ControllerConnections>()
  const [connectionSampleAt, setConnectionSampleAt] = useState<number>()
  const [connectionSampleMs, setConnectionSampleMs] = useState(0)
  const [activityNow, setActivityNow] = useState(Date.now())
  const [activityMetadata, setActivityMetadata] = useState<{
    key: string
    value: ApplicationMetadata
  }>()
  const [rememberedTopApplication, setRememberedTopApplication] = useState<
    RememberedTopApplication | undefined
  >(() => {
    try {
      return parseRememberedTopApplication(localStorage.getItem(rememberedTopApplicationStorageKey))
    } catch {
      return undefined
    }
  })
  const previousConnections = useRef<ControllerConnectionDetail[] | undefined>(undefined)
  const previousConnectionsAt = useRef<number | undefined>(undefined)
  const connectionCounterResets = useRef(createConnectionCounterResetState())
  const connectionInterval = appConfig?.connectionInterval ?? 500
  const connectionIntervalRef = useRef(connectionInterval)
  connectionIntervalRef.current = connectionInterval
  const activityFreshnessMs = connectionActivityFreshnessMs(connectionInterval)
  useEffect(() => {
    const reset = (): void => {
      setConnections(undefined)
      setConnectionSampleAt(undefined)
      setConnectionSampleMs(0)
      previousConnections.current = undefined
      previousConnectionsAt.current = undefined
      connectionCounterResets.current = createConnectionCounterResetState()
    }
    const onVisible = (): void => {
      if (!document.hidden) setActivityNow(Date.now())
    }
    const removeStarted = window.electron.ipcRenderer.on('core-started', reset)
    const removeStopped = window.electron.ipcRenderer.on('core-stopped', reset)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      removeStarted()
      removeStopped()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  useEffect(() => {
    const removeConnections = window.electron.ipcRenderer.on(
      'mihomoConnections',
      (_event, info: ControllerConnections) => {
        const receivedAt = Date.now()
        if (
          previousConnectionsAt.current !== undefined &&
          receivedAt <= previousConnectionsAt.current
        ) {
          return
        }
        if (!info.connections) {
          previousConnections.current = undefined
          previousConnectionsAt.current = undefined
          connectionCounterResets.current = createConnectionCounterResetState()
          setConnectionSampleAt(undefined)
          setConnectionSampleMs(0)
          setConnections(info)
          return
        }
        const sampleMs = receivedAt - (previousConnectionsAt.current ?? receivedAt)
        const maximumGapMs = connectionActivityFreshnessMs(connectionIntervalRef.current)
        const baseline = sampleMs <= maximumGapMs ? previousConnections.current : undefined
        if (!baseline) connectionCounterResets.current = createConnectionCounterResetState()
        setConnections({
          ...info,
          connections: withConnectionSpeeds(info.connections, baseline, sampleMs, maximumGapMs)
        })
        previousConnections.current = nextConnectionCounterBaseline(
          info.connections,
          baseline,
          connectionCounterResets.current
        )
        previousConnectionsAt.current = receivedAt
        setConnectionSampleAt(receivedAt)
        setConnectionSampleMs(baseline ? sampleMs : 0)
        setActivityNow(receivedAt)
      }
    )
    return () => {
      removeConnections()
    }
  }, [])

  useEffect(() => {
    if (connectionSampleAt === undefined) return
    const remaining = connectionSampleAt + activityFreshnessMs - Date.now()
    const timer = window.setTimeout(() => setActivityNow(Date.now()), Math.max(0, remaining) + 1)
    return () => window.clearTimeout(timer)
  }, [connectionSampleAt, activityFreshnessMs])

  const connectionSampleFresh = hasFreshConnectionActivity(
    connectionSampleAt,
    connectionSampleMs,
    activityNow,
    connectionInterval
  )
  const topApplication = useMemo(
    () =>
      connectionSampleFresh ? topActiveApplication(connections?.connections, platform) : undefined,
    [connectionSampleFresh, connections?.connections]
  )

  useEffect(() => {
    if (!topApplication) return
    const remembered = rememberTopApplication(topApplication)
    setRememberedTopApplication(remembered)
    try {
      localStorage.setItem(rememberedTopApplicationStorageKey, JSON.stringify(remembered))
    } catch {
      // The current Home view can still retain the application in memory.
    }
  }, [topApplication?.key, topApplication?.name, topApplication?.lookupPath])

  const displayedApplication = displayedTopApplication(topApplication, rememberedTopApplication)

  useEffect(() => {
    if (!displayedApplication) return
    let active = true
    const { key, lookupPath } = displayedApplication
    void loadApplicationMetadata(lookupPath).then((value) => {
      if (active) setActivityMetadata({ key, value })
    })
    return () => {
      active = false
    }
  }, [displayedApplication?.key, displayedApplication?.lookupPath])
  const cardStyle = hasActiveBackground ? 'border-separator/50 shadow-none' : 'home-overview-card'
  const cardBackgroundStyle = hasActiveBackground
    ? {
        backgroundColor: `color-mix(in srgb, var(--surface) ${cardOpacity}%, transparent)`,
        backdropFilter: 'blur(1px)'
      }
    : undefined
  const trafficState = overviewTrafficState(history)
  const trafficRangeSeconds = overviewTrafficRangeSeconds(history, trafficNow)
  return (
    <Surface
      className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${cardStyle}`}
      style={cardBackgroundStyle}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{tr('Traffic')}</h2>
        <Link
          to="/connections"
          className="group app-nodrag rounded-md hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={overviewConnectionLabel(connections?.connections?.length)}
        >
          <OverviewConnectionAction count={connections?.connections?.length} />
        </Link>
      </div>
      <div className="home-traffic-summary min-w-0">
        <OverviewStat
          icon={
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft/50 text-accent">
              <LuArrowDown className="size-4" aria-hidden="true" />
            </span>
          }
          label={tr('Download')}
          value={<OverviewTrafficRate bytesPerSecond={rates?.down} />}
          secondary={
            connections?.downloadTotal !== undefined
              ? tr('{0} this session', [formatOverviewBytes(connections.downloadTotal)])
              : undefined
          }
          valueClassName="text-[1.4rem]"
          secondaryClassName="text-[13px]"
        />
        <OverviewStat
          icon={
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger-soft/50 text-danger">
              <LuArrowUp className="size-4" aria-hidden="true" />
            </span>
          }
          label={tr('Upload')}
          value={<OverviewTrafficRate bytesPerSecond={rates?.up} />}
          secondary={
            connections?.uploadTotal !== undefined
              ? tr('{0} this session', [formatOverviewBytes(connections.uploadTotal)])
              : undefined
          }
          valueClassName="text-[1.4rem]"
          secondaryClassName="text-[13px]"
        />
        <TopActiveAppRow
          application={displayedApplication}
          metadata={
            displayedApplication
              ? metadataForTopActiveApp(displayedApplication, activityMetadata)
              : undefined
          }
          sampleMs={topApplication ? connectionSampleMs : undefined}
        />
      </div>
      {trafficState === 'active' ? (
        <div className="mt-4 border-t border-separator/40 pt-3">
          <div
            className="relative h-24 overflow-hidden rounded-lg"
            style={
              hasActiveBackground
                ? {
                    backgroundColor: `color-mix(in srgb, var(--surface) ${Math.min(100, cardOpacity + 16)}%, transparent)`
                  }
                : undefined
            }
          >
            <OverviewTrafficChart data={history} now={trafficNow} />
            <span className="absolute bottom-1.5 left-2 text-[10px] text-muted">
              {trafficRangeSeconds === undefined
                ? tr('Latest sample')
                : trafficRangeSeconds === 1
                  ? tr('Last 1 second')
                  : tr('Last {0} seconds', [trafficRangeSeconds])}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex h-10 flex-col justify-end gap-2 text-xs text-muted">
          <span>
            {trafficState === 'idle'
              ? tr('No recent traffic')
              : runtimeStopped
                ? tr('Unavailable')
                : tr('Waiting for traffic')}
          </span>
          <div className="h-px w-full bg-separator/60" aria-hidden="true" />
        </div>
      )}
    </Surface>
  )
})
