import { Surface } from '@heroui/react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuArrowDown,
  LuArrowRight,
  LuArrowUp,
  LuCalendarDays,
  LuClock3,
  LuCpu,
  LuRefreshCw,
  LuTriangleAlert
} from 'react-icons/lu'
import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { getLocale, tr } from '../../../shared/i18n'
import {
  displayServiceVersion,
  homeRuntimeState,
  type PublicIpInfo,
  type PublicIpSnapshot
} from '../../../shared/home'
import BasePage from '@renderer/components/base/base-page'
import { CountryFlag } from '@renderer/components/base/country-flag'
import {
  OverviewTrafficChart,
  overviewTrafficState,
  type OverviewTrafficSample
} from '@renderer/components/home/overview-traffic-chart'
import { withConnectionSpeeds } from '@renderer/components/connections/connection-speeds'
import { normalizeCoreVersion } from '@renderer/components/sider/core-version'
import {
  OverviewMetadataRow,
  OverviewConnectionAction,
  OverviewPublicIp,
  overviewConnectionLabel,
  OverviewRoutingChip,
  OverviewConfiguredChips,
  OverviewStat,
  OverviewStatusLine,
  OverviewSubscriptionChips,
  OverviewUsageSummary,
  OverviewTrafficRate,
  formatOverviewBytes
} from '@renderer/components/home/overview-parts'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { calcTraffic } from '@renderer/utils/calc'
import { topActiveApplication } from '@renderer/utils/home-connections'
import { configuredOverviewFeatures } from '@renderer/utils/home-overview'
import { platform } from '@renderer/utils/init'
import { nextProfileUpdateAt } from '../../../shared/profile-update'
import {
  getAppRoutingStatus,
  getHomeBackgroundDataUrl,
  getHomePublicIp,
  getHomeServiceVersion,
  mihomoVersion,
  serviceStatus,
  startHomeNetworkObservation,
  stopHomeNetworkObservation
} from '@renderer/utils/ipc'
import './home.css'

dayjs.extend(relativeTime)

type ServiceState = Awaited<ReturnType<typeof serviceStatus>>

function serviceStateLabel(state: ServiceState | undefined): string {
  switch (state) {
    case 'running':
      return tr('Running')
    case 'requires-approval':
      return tr('Requires approval')
    case 'need-init':
      return tr('Needs setup')
    case 'stopped':
    case 'paused':
      return tr('Stopped')
    case 'not-installed':
      return tr('Not installed')
    default:
      return tr('Unavailable')
  }
}

function selectedGlobalProxy(groups: ControllerMixedGroup[]): {
  name?: string
  protocol?: string
  latency?: number
} {
  const global = groups.find((group) => group.name.toUpperCase() === 'GLOBAL')
  if (!global?.now) return {}
  let name = global.now
  const visited = new Set<string>()
  for (let step = 0; step < 8 && !visited.has(name); step += 1) {
    visited.add(name)
    const entry = groups.flatMap((group) => group.all).find((proxy) => proxy.name === name)
    if (!entry) return { name }
    if ('now' in entry && entry.now && entry.now !== name) {
      name = entry.now
      continue
    }
    const delay = entry.history?.at(-1)?.delay
    return {
      name,
      protocol: entry.type,
      latency: delay && delay > 0 ? delay : undefined
    }
  }
  return { name }
}

function countryLabel(info?: PublicIpInfo): string {
  if (!info) return tr('Public IP')
  if (info.countryCode) {
    try {
      return (
        new Intl.DisplayNames([getLocale()], { type: 'region' }).of(info.countryCode) ??
        info.country ??
        info.countryCode
      )
    } catch {
      return info.country ?? info.countryCode
    }
  }
  return info.country ?? tr('Unknown location')
}

const Home = () => {
  const { appConfig } = useAppConfig()
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { profileConfig } = useProfileConfig()
  const { groups = [] } = useGroups()
  const {
    data: coreVersion,
    error: coreError,
    isLoading: coreLoading,
    mutate: refreshCore
  } = useSWR('mihomoVersion', mihomoVersion, { refreshInterval: 10_000 })
  const { data: serviceState, mutate: refreshService } = useSWR('serviceStatus', serviceStatus, {
    refreshInterval: 10_000
  })
  const { data: serviceVersion } = useSWR(
    serviceState === 'running' ? 'homeServiceVersion' : null,
    getHomeServiceVersion
  )
  const { data: routingStatus } = useSWR('sidebarAppRoutingStatus', getAppRoutingStatus)
  const [publicIpSnapshot, setPublicIpSnapshot] = useState<PublicIpSnapshot>({ stale: true })
  const publicIp = publicIpSnapshot.info
  const [refreshingIp, setRefreshingIp] = useState(false)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [backgroundUrl, setBackgroundUrl] = useState<string>()
  const [rates, setRates] = useState({ up: 0, down: 0 })
  const [connections, setConnections] = useState<ControllerConnections>()
  const [history, setHistory] = useState<OverviewTrafficSample[]>([])
  const [coreStopped, setCoreStopped] = useState(false)
  const [now, setNow] = useState(Date.now())
  const observedIp = useRef<string | undefined>(undefined)
  const previousConnections = useRef<ControllerConnectionDetail[] | undefined>(undefined)
  const previousConnectionsAt = useRef<number | undefined>(undefined)
  const mode = controledMihomoConfig?.mode ?? 'rule'
  const globalProxy = useMemo(() => selectedGlobalProxy(groups), [groups])
  const profile = profileConfig?.items.find((item) => item.id === profileConfig.current)
  const background = appConfig?.homeBackground
  const hasBackground = Boolean(background && backgroundUrl)

  useEffect(() => {
    if (!background?.file) {
      setBackgroundUrl(undefined)
      return
    }
    let active = true
    void getHomeBackgroundDataUrl()
      .then((url) => {
        if (active) setBackgroundUrl(url)
      })
      .catch(() => {
        if (active) setBackgroundUrl(undefined)
      })
    return () => {
      active = false
    }
  }, [background?.file])

  useEffect(() => {
    const refresh = (): void => setRefreshSignal((current) => current + 1)
    const coreStarted = (): void => {
      setCoreStopped(false)
      setRates({ up: 0, down: 0 })
      setHistory([])
      setConnections(undefined)
      previousConnections.current = undefined
      previousConnectionsAt.current = undefined
      refresh()
      void refreshCore()
      void refreshService()
    }
    const coreStoppedHandler = (): void => {
      setCoreStopped(true)
      setRates({ up: 0, down: 0 })
      setHistory([])
      setConnections(undefined)
      previousConnections.current = undefined
      previousConnectionsAt.current = undefined
      refresh()
    }
    const onVisible = (): void => {
      if (!document.hidden) {
        setNow(Date.now())
        refresh()
      }
    }
    const removeNetwork = window.electron.ipcRenderer.on('homeNetworkChanged', refresh)
    const removeGroups = window.electron.ipcRenderer.on('groupsUpdated', refresh)
    const removeCore = window.electron.ipcRenderer.on('core-started', coreStarted)
    const removeCoreStopped = window.electron.ipcRenderer.on('core-stopped', coreStoppedHandler)
    document.addEventListener('visibilitychange', onVisible)
    void startHomeNetworkObservation()
    return () => {
      removeNetwork()
      removeGroups()
      removeCore()
      removeCoreStopped()
      document.removeEventListener('visibilitychange', onVisible)
      void stopHomeNetworkObservation()
    }
  }, [refreshCore, refreshService])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setRefreshingIp(true)
      void getHomePublicIp()
        .then((next) => {
          if (active) {
            if (observedIp.current !== next.info?.ip) {
              observedIp.current = next.info?.ip
              setRevealed(false)
            }
            setPublicIpSnapshot(next)
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setRefreshingIp(false)
        })
    }, 750)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [mode, globalProxy.name, refreshSignal])

  useEffect(() => {
    let lastSampleAt = 0
    const removeTraffic = window.electron.ipcRenderer.on(
      'mihomoTraffic',
      (_event, info: ControllerTraffic) => {
        setRates({ up: info.up, down: info.down })
        if (Date.now() - lastSampleAt < 1000) return
        lastSampleAt = Date.now()
        setHistory((samples) => [
          ...samples.slice(-59),
          { up: info.up, down: info.down, index: lastSampleAt }
        ])
      }
    )
    const removeConnections = window.electron.ipcRenderer.on(
      'mihomoConnections',
      (_event, info: ControllerConnections) => {
        const receivedAt = Date.now()
        const sampleMs = receivedAt - (previousConnectionsAt.current ?? receivedAt)
        setConnections({
          ...info,
          connections: info.connections
            ? withConnectionSpeeds(info.connections, previousConnections.current, sampleMs)
            : undefined
        })
        previousConnections.current = info.connections
        previousConnectionsAt.current = receivedAt
      }
    )
    return () => {
      removeTraffic()
      removeConnections()
    }
  }, [])

  const expiresSoon =
    profile?.extra?.expire &&
    profile.extra.expire > 0 &&
    dayjs.unix(profile.extra.expire).diff(dayjs(), 'day') <= 7
  const serviceExpected =
    appConfig?.corePermissionMode === 'service' ||
    appConfig?.sysProxy.enable === true ||
    appConfig?.autoSetDNSMode === 'service' ||
    (routingStatus && !['disabled', 'unsupported'].includes(routingStatus.state))
  const attention =
    serviceState === 'requires-approval'
      ? {
          text: tr('KokoroBox Service requires approval.'),
          path: '/settings?section=core&panel=runtime'
        }
      : serviceExpected && serviceState && serviceState !== 'running'
        ? {
            text: tr('KokoroBox Service is unavailable.'),
            path: '/settings?section=core&panel=runtime'
          }
        : routingStatus?.needsUserApproval ||
            routingStatus?.state === 'degraded' ||
            routingStatus?.state === 'error'
          ? { text: tr('Application routing needs attention.'), path: '/app-routing' }
          : expiresSoon
            ? { text: tr('The current subscription expires soon.'), path: '/profiles' }
            : undefined

  const usage = (profile?.extra?.download ?? 0) + (profile?.extra?.upload ?? 0)
  const quota = profile?.extra?.total ?? 0
  const nextUpdateAt = profile ? nextProfileUpdateAt(profile, now) : undefined
  const topApplication = useMemo(
    () => topActiveApplication(connections?.connections),
    [connections?.connections]
  )
  const cardStyle = hasBackground
    ? 'border-separator/50 bg-surface/88 backdrop-blur-sm'
    : 'border-separator/60 bg-surface/85'
  const runtime = homeRuntimeState(
    !coreStopped && !coreError && Boolean(coreVersion),
    appConfig?.corePermissionMode,
    serviceState
  )
  const configuredFeatures = configuredOverviewFeatures({
    proxyEnabled: appConfig?.sysProxy.enable === true,
    dnsConfigured: appConfig?.autoSetDNSMode === 'service',
    platform,
    tunEnabled: Boolean(controledMihomoConfig?.tun?.enable),
    coreRunning: runtime.mihomo !== 'stopped',
    appRoutingRunning: routingStatus?.state === 'running',
    protectedApplicationCount: routingStatus?.protectedApplicationCount
  })
  const mihomoVersionLabel = normalizeCoreVersion(coreVersion?.version)
  const serviceVersionLabel = displayServiceVersion(serviceVersion)
  const serviceTone =
    serviceState === 'running'
      ? 'success'
      : serviceState === 'requires-approval' || serviceState === 'need-init'
        ? 'warning'
        : serviceExpected && serviceState
          ? 'danger'
          : 'neutral'
  const trafficState = overviewTrafficState(history)
  const hasTrafficSnapshot = trafficState !== 'unavailable'

  return (
    <BasePage title={tr('Overview')} contentClassName="overflow-x-hidden">
      <main className="@container relative min-h-full min-w-0 overflow-hidden">
        {hasBackground && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${backgroundUrl})`,
                backgroundSize: background?.fit,
                backgroundPosition: background?.position,
                backgroundRepeat: 'no-repeat',
                opacity: (background?.opacity ?? 70) / 100,
                filter: `blur(${background?.blur ?? 0}px)`,
                transform: background?.blur ? 'scale(1.04)' : undefined
              }}
            />
            <div
              className="absolute inset-0 bg-background"
              style={{ opacity: (background?.overlay ?? 35) / 100 }}
            />
          </div>
        )}
        <div className="home-overview relative mx-auto flex w-full max-w-[1000px] flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5">
          {attention && (
            <Surface
              variant="secondary"
              className="flex min-w-0 items-center gap-3 rounded-xl border border-warning/40 px-4 py-3"
            >
              <LuTriangleAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm">{attention.text}</p>
              <Link
                className="shrink-0 text-sm font-medium text-accent hover:underline"
                to={attention.path}
              >
                {attention.path === '/profiles' ? tr('Open subscriptions') : tr('Open settings')}
              </Link>
            </Surface>
          )}

          <Surface
            className={`home-network-hero min-w-0 rounded-2xl border border-accent/20 p-4 shadow-none sm:p-5 ${hasBackground ? 'bg-surface/75 backdrop-blur-sm' : 'bg-accent-soft/20'}`}
            style={
              hasBackground
                ? undefined
                : {
                    backgroundImage:
                      'linear-gradient(115deg, color-mix(in oklab, var(--accent) 10%, var(--surface)), var(--surface) 78%)'
                  }
            }
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{tr('Network')}</h2>
              {publicIpSnapshot.stale && publicIp ? (
                <span className="text-xs text-warning">{tr('Last known exit')}</span>
              ) : refreshingIp ? (
                <span className="text-xs text-muted">{tr('Refreshing')}</span>
              ) : null}
            </div>
            <div className="home-network-main min-w-0">
              <div className="flex min-w-0 items-center gap-3">
                <CountryFlag code={publicIp?.countryCode} className="size-12 sm:size-13" />
                <div className="min-w-0 flex-1">
                  {publicIp ? (
                    <OverviewPublicIp
                      ip={publicIp.ip}
                      revealed={revealed}
                      onToggle={() => setRevealed((current) => !current)}
                    />
                  ) : (
                    <div className="text-xl font-semibold text-muted">{tr('Unavailable')}</div>
                  )}
                  <div className="mt-0.5 text-[0.95rem] text-muted">{countryLabel(publicIp)}</div>
                  {(publicIp?.isp || publicIp?.asn) && (
                    <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs text-muted">
                      {publicIp.isp && <span className="min-w-0 break-words">{publicIp.isp}</span>}
                      {publicIp.isp && publicIp.asn && <span aria-hidden="true">·</span>}
                      {publicIp.asn && <span className="shrink-0">{publicIp.asn}</span>}
                    </div>
                  )}
                </div>
              </div>
              <div className="home-network-routing min-w-0">
                <div className="mb-2 text-xs font-medium text-muted">{tr('Routing')}</div>
                <OverviewRoutingChip mode={mode} />
                {mode === 'rule' && (
                  <div className="mt-2 text-xs text-muted">{tr('Selected by routing rules')}</div>
                )}
                {mode === 'global' && (
                  <div className="mt-2 min-w-0">
                    <div className="truncate text-sm font-medium" title={globalProxy.name}>
                      {globalProxy.name ?? tr('Unavailable')}
                    </div>
                    {(globalProxy.protocol || globalProxy.latency !== undefined) && (
                      <div className="mt-0.5 text-xs text-muted">
                        {[
                          globalProxy.protocol,
                          globalProxy.latency !== undefined
                            ? `${globalProxy.latency} ms`
                            : undefined
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                )}
                {mode === 'direct' && (
                  <div className="mt-2 text-xs text-muted">{tr('Direct connection')}</div>
                )}
              </div>
            </div>
          </Surface>

          <div className="home-overview-pair min-w-0">
            <Surface className={`min-w-0 rounded-2xl border p-4 shadow-none sm:p-5 ${cardStyle}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{tr('Current subscription')}</h2>
                <Link
                  to="/profiles"
                  className="app-nodrag rounded-md p-1 text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                  aria-label={tr('Open subscriptions')}
                >
                  <LuArrowRight className="size-4" />
                </Link>
              </div>
              {profile ? (
                <div className="space-y-2.5">
                  <div className="min-w-0">
                    <div
                      className="line-clamp-2 break-words text-base font-semibold"
                      title={profile.name}
                    >
                      {profile.name}
                    </div>
                    <div className="mt-2">
                      <OverviewSubscriptionChips profile={profile} />
                    </div>
                  </div>
                  <OverviewUsageSummary usage={usage} quota={quota} />
                  <dl className="space-y-0.5 pt-0.5">
                    {profile.extra?.expire ? (
                      <OverviewMetadataRow
                        icon={<LuCalendarDays className="size-3.5 shrink-0" aria-hidden="true" />}
                        label={tr('Expires')}
                        value={dayjs.unix(profile.extra.expire).format('YYYY-MM-DD')}
                      />
                    ) : null}
                    {profile.updated ? (
                      <OverviewMetadataRow
                        icon={<LuRefreshCw className="size-3.5 shrink-0" aria-hidden="true" />}
                        label={tr('Updated')}
                        value={dayjs(profile.updated).fromNow()}
                      />
                    ) : null}
                    {profile.type === 'remote' &&
                      (profile.autoUpdate === false || nextUpdateAt !== undefined) && (
                        <OverviewMetadataRow
                          icon={<LuClock3 className="size-3.5 shrink-0" aria-hidden="true" />}
                          label={tr('Next update')}
                          value={
                            profile.autoUpdate === false ? (
                              tr('Auto update off')
                            ) : nextUpdateAt !== undefined && nextUpdateAt <= now ? (
                              tr('Update due')
                            ) : (
                              <span title={tr('Estimated from update interval')}>
                                {tr('In about {0}', [dayjs(nextUpdateAt).fromNow(true)])}
                              </span>
                            )
                          }
                        />
                      )}
                  </dl>
                </div>
              ) : (
                <Link to="/profiles" className="app-nodrag text-sm text-muted hover:text-accent">
                  {tr('No subscription selected. Open subscriptions to choose one.')}
                </Link>
              )}
            </Surface>

            <Surface className={`min-w-0 rounded-2xl border p-4 shadow-none sm:p-5 ${cardStyle}`}>
              <h2 className="mb-3 text-sm font-semibold">{tr('Runtime')}</h2>
              <OverviewStat
                icon={
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft/55 text-accent">
                    <LuCpu className="size-5" aria-hidden="true" />
                  </span>
                }
                value={
                  coreLoading && !coreStopped
                    ? tr('Loading')
                    : runtime.mihomo === 'system-service'
                      ? tr('System service')
                      : runtime.mihomo === 'direct-run'
                        ? tr('Direct run')
                        : tr('Stopped')
                }
                secondary={
                  runtime.mihomo !== 'stopped' && mihomoVersionLabel
                    ? `Mihomo ${mihomoVersionLabel}`
                    : 'Mihomo'
                }
                valueClassName="text-[1.35rem]"
              />
              <div className="mt-5 border-t border-separator/60 pt-3">
                <OverviewStatusLine
                  label={tr('KokoroBox Service')}
                  status={serviceStateLabel(runtime.service as ServiceState | undefined)}
                  tone={serviceTone}
                  version={serviceState === 'running' ? serviceVersionLabel : undefined}
                />
              </div>
              {configuredFeatures.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs text-muted">{tr('Configured')}</div>
                  <OverviewConfiguredChips features={configuredFeatures} />
                </div>
              )}
            </Surface>
          </div>

          <Surface className={`min-w-0 rounded-2xl border p-4 shadow-none sm:p-5 ${cardStyle}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{tr('Traffic')}</h2>
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
                value={
                  <OverviewTrafficRate
                    bytesPerSecond={hasTrafficSnapshot ? rates.down : undefined}
                  />
                }
                secondary={
                  connections?.downloadTotal !== undefined
                    ? tr('{0} this session', [formatOverviewBytes(connections.downloadTotal)])
                    : undefined
                }
                valueClassName="text-[1.4rem]"
              />
              <OverviewStat
                icon={
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger-soft/50 text-danger">
                    <LuArrowUp className="size-4" aria-hidden="true" />
                  </span>
                }
                label={tr('Upload')}
                value={
                  <OverviewTrafficRate bytesPerSecond={hasTrafficSnapshot ? rates.up : undefined} />
                }
                secondary={
                  connections?.uploadTotal !== undefined
                    ? tr('{0} this session', [formatOverviewBytes(connections.uploadTotal)])
                    : undefined
                }
                valueClassName="text-[1.4rem]"
              />
              {topApplication && (
                <Link
                  to="/connections"
                  className="home-top-activity app-nodrag flex min-w-0 items-center justify-between gap-3 rounded-lg bg-surface-secondary/45 px-3 py-2 text-xs hover:bg-surface-secondary/70 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="min-w-0">
                    <span className="block text-muted">{tr('Top activity')}</span>
                    <span
                      className="block truncate font-medium text-foreground"
                      title={topApplication.name}
                    >
                      {topApplication.name}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {calcTraffic(topApplication.speed)}/s
                  </span>
                </Link>
              )}
            </div>
            {trafficState === 'active' ? (
              <div className="relative mt-3 h-20 overflow-hidden">
                <OverviewTrafficChart data={history} />
              </div>
            ) : (
              <div className="mt-3 flex h-10 flex-col justify-end gap-2 text-xs text-muted">
                <span>
                  {trafficState === 'idle'
                    ? tr('No recent traffic')
                    : runtime.mihomo === 'stopped'
                      ? tr('Unavailable')
                      : tr('Waiting for traffic')}
                </span>
                <div className="h-px w-full bg-separator/60" aria-hidden="true" />
              </div>
            )}
          </Surface>
        </div>
      </main>
    </BasePage>
  )
}

export default Home
