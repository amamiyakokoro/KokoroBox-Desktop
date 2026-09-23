import { Chip, Surface } from '@heroui/react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LuArrowDown, LuArrowRight, LuArrowUp, LuTriangleAlert } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { getLocale, tr } from '../../../shared/i18n'
import {
  displayServiceVersion,
  homeRuntimeState,
  maskPublicIp,
  type PublicIpInfo,
  type PublicIpSnapshot
} from '../../../shared/home'
import BasePage from '@renderer/components/base/base-page'
import { CountryFlag } from '@renderer/components/base/country-flag'
import TrafficChart from '@renderer/components/sider/traffic-chart'
import { withConnectionSpeeds } from '@renderer/components/connections/connection-speeds'
import { getOutboundModeLabel } from '@renderer/components/sider/outbound-mode'
import { normalizeCoreVersion } from '@renderer/components/sider/core-version'
import {
  OverviewMetadataRow,
  OverviewConnectionChip,
  OverviewRoutingChips,
  OverviewServiceChips,
  OverviewStat,
  OverviewStatusLine,
  OverviewSubscriptionChips,
  OverviewUsageSummary
} from '@renderer/components/home/overview-parts'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { calcTraffic } from '@renderer/utils/calc'
import { activeRouteCount, topActiveApplication } from '@renderer/utils/home-connections'
import { configuredOverviewServiceFeatures } from '@renderer/utils/home-overview'
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

dayjs.extend(relativeTime)

type ServiceState = Awaited<ReturnType<typeof serviceStatus>>
type TrafficSample = { traffic: number; index: number }

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
  const [history, setHistory] = useState<TrafficSample[]>([])
  const [coreStopped, setCoreStopped] = useState(false)
  const [now, setNow] = useState(Date.now())
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
          if (active) setPublicIpSnapshot(next)
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
          { traffic: info.up + info.down, index: lastSampleAt }
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
  const activeRoutes = useMemo(
    () => activeRouteCount(connections?.connections),
    [connections?.connections]
  )
  const cardStyle = hasBackground
    ? 'border-separator/50 bg-surface/80 backdrop-blur-sm'
    : 'border-separator/60 bg-surface/85'
  const runtime = homeRuntimeState(
    !coreStopped && !coreError && Boolean(coreVersion),
    appConfig?.corePermissionMode,
    serviceState
  )
  const serviceFeatures = configuredOverviewServiceFeatures({
    serviceRunning: serviceState === 'running',
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
  const hasRecentTraffic = history.some(({ traffic }) => traffic > 0)

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
        <div className="relative mx-auto flex w-full max-w-[1000px] flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5">
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

          <Surface className={`min-w-0 rounded-2xl border p-4 shadow-none sm:p-5 ${cardStyle}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{tr('Network')}</h2>
              {publicIpSnapshot.stale && publicIp ? (
                <Chip size="sm" variant="soft" color="warning">
                  {tr('Last known exit')}
                </Chip>
              ) : refreshingIp ? (
                <span className="text-xs text-muted">{tr('Refreshing')}</span>
              ) : null}
            </div>
            <OverviewStat
              icon={<CountryFlag code={publicIp?.countryCode} className="size-11" />}
              value={
                publicIp ? (
                  <button
                    type="button"
                    title={revealed ? tr('Hide IP address') : tr('Reveal IP address')}
                    aria-label={revealed ? tr('Hide IP address') : tr('Reveal IP address')}
                    aria-pressed={revealed}
                    onClick={() => setRevealed((current) => !current)}
                    className="app-nodrag -ml-1 max-w-full break-all rounded-md px-1 text-left font-mono text-xl font-semibold text-foreground outline-offset-2 hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent sm:text-2xl"
                  >
                    {revealed ? publicIp.ip : maskPublicIp(publicIp.ip)}
                  </button>
                ) : (
                  tr('Unavailable')
                )
              }
              secondary={countryLabel(publicIp)}
            />
            {(publicIp?.isp || publicIp?.asn) && (
              <dl className="mt-3 space-y-0.5">
                {publicIp.isp && (
                  <OverviewMetadataRow label={tr('Network provider')} value={publicIp.isp} />
                )}
                {publicIp.asn && <OverviewMetadataRow label="ASN" value={publicIp.asn} />}
              </dl>
            )}
            <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">{tr('Routing')}</span>
              <OverviewRoutingChips mode={mode} activeRoutes={activeRoutes} proxy={globalProxy} />
            </div>
          </Surface>

          <div className="flex min-w-0 flex-wrap gap-3">
            <Surface
              className={`min-w-0 rounded-2xl border p-4 shadow-none sm:p-5 ${cardStyle}`}
              style={{ flex: '1 1 300px' }}
            >
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
                <div className="space-y-3">
                  <div className="min-w-0">
                    <div
                      className="line-clamp-2 break-words text-base font-semibold"
                      title={profile.name}
                    >
                      {profile.name}
                    </div>
                    <div className="mt-1.5">
                      <OverviewSubscriptionChips profile={profile} />
                    </div>
                  </div>
                  <OverviewUsageSummary usage={usage} quota={quota} />
                  <dl className="space-y-0.5">
                    {profile.extra?.expire ? (
                      <OverviewMetadataRow
                        label={tr('Expires')}
                        value={dayjs.unix(profile.extra.expire).format('YYYY-MM-DD')}
                      />
                    ) : null}
                    {profile.updated ? (
                      <OverviewMetadataRow
                        label={tr('Updated')}
                        value={dayjs(profile.updated).fromNow()}
                      />
                    ) : null}
                    {profile.type === 'remote' &&
                      (profile.autoUpdate === false || nextUpdateAt !== undefined) && (
                        <OverviewMetadataRow
                          label={tr('Next update')}
                          value={
                            profile.autoUpdate === false
                              ? tr('Auto update off')
                              : nextUpdateAt !== undefined && nextUpdateAt <= now
                                ? tr('Update due')
                                : dayjs(nextUpdateAt).fromNow()
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

            <Surface
              className={`min-w-0 rounded-2xl border p-4 shadow-none sm:p-5 ${cardStyle}`}
              style={{ flex: '1 1 230px' }}
            >
              <h2 className="mb-3 text-sm font-semibold">{tr('Runtime')}</h2>
              <OverviewStat
                label="Mihomo"
                value={
                  coreLoading && !coreStopped
                    ? tr('Loading')
                    : runtime.mihomo === 'system-service'
                      ? tr('System service')
                      : runtime.mihomo === 'direct-run'
                        ? tr('Direct run')
                        : tr('Stopped')
                }
                secondary={runtime.mihomo !== 'stopped' ? mihomoVersionLabel : undefined}
              />
              <div className="mt-2">
                <Chip size="sm" variant="soft" color="default">
                  {getOutboundModeLabel(mode)}
                </Chip>
              </div>
              <div className="mt-4">
                <OverviewStatusLine
                  label={tr('KokoroBox Service')}
                  status={serviceStateLabel(runtime.service as ServiceState | undefined)}
                  tone={serviceTone}
                  version={serviceState === 'running' ? serviceVersionLabel : undefined}
                />
              </div>
              {serviceFeatures.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs text-muted">{tr('Configured')}</div>
                  <OverviewServiceChips features={serviceFeatures} />
                </div>
              )}
            </Surface>
          </div>

          <Surface className={`min-w-0 rounded-2xl border p-4 shadow-none sm:p-5 ${cardStyle}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{tr('Traffic')}</h2>
              <Link
                to="/connections"
                className="app-nodrag rounded-full focus-visible:outline-2 focus-visible:outline-accent"
                aria-label={
                  connections?.connections
                    ? tr('{0} connections', [connections.connections.length])
                    : tr('Connections')
                }
              >
                <OverviewConnectionChip count={connections?.connections?.length} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <OverviewStat
                label={
                  <span className="inline-flex items-center gap-1">
                    <LuArrowDown aria-hidden="true" />
                    {tr('Download')}
                  </span>
                }
                value={
                  <span title={`${calcTraffic(rates.down)}/s`}>{calcTraffic(rates.down)}/s</span>
                }
                secondary={tr('{0} this session', [calcTraffic(connections?.downloadTotal ?? 0)])}
              />
              <OverviewStat
                label={
                  <span className="inline-flex items-center gap-1">
                    <LuArrowUp aria-hidden="true" />
                    {tr('Upload')}
                  </span>
                }
                value={<span title={`${calcTraffic(rates.up)}/s`}>{calcTraffic(rates.up)}/s</span>}
                secondary={tr('{0} this session', [calcTraffic(connections?.uploadTotal ?? 0)])}
              />
            </div>
            {topApplication && (
              <dl className="mt-3">
                <OverviewMetadataRow
                  label={tr('Top activity')}
                  value={
                    <Link
                      to="/connections"
                      className="app-nodrag hover:text-accent"
                      title={topApplication.name}
                    >
                      {topApplication.name} · {calcTraffic(topApplication.speed)}/s
                    </Link>
                  }
                />
              </dl>
            )}
            <div
              className={`relative mt-3 overflow-hidden ${hasRecentTraffic ? 'h-20' : 'h-11'}`}
              aria-hidden="true"
            >
              {hasRecentTraffic ? (
                <TrafficChart data={history} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
                  {tr('No recent traffic')}
                </div>
              )}
            </div>
          </Surface>
        </div>
      </main>
    </BasePage>
  )
}

export default Home
