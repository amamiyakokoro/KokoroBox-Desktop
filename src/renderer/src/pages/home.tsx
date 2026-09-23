import { Meter, Surface } from '@heroui/react'
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
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { calcTraffic } from '@renderer/utils/calc'
import { activeRouteCount, topActiveApplication } from '@renderer/utils/home-connections'
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
  const remainingQuota = Math.max(quota - usage, 0)
  const nextUpdateAt = profile ? nextProfileUpdateAt(profile, now) : undefined
  const topApplication = useMemo(
    () => topActiveApplication(connections?.connections),
    [connections?.connections]
  )
  const activeRoutes = useMemo(
    () => activeRouteCount(connections?.connections),
    [connections?.connections]
  )
  const proxyName = mode === 'global' ? globalProxy.name : undefined
  const proxyDetails =
    mode === 'global'
      ? [globalProxy.protocol, globalProxy.latency ? `${globalProxy.latency} ms` : undefined]
          .filter(Boolean)
          .join(' · ')
      : undefined
  const routingDetail =
    mode === 'rule'
      ? `${getOutboundModeLabel(mode)} · ${
          activeRoutes > 0
            ? activeRoutes === 1
              ? tr('{0} active route', [activeRoutes])
              : tr('{0} active routes', [activeRoutes])
            : tr('Selected dynamically')
        }`
      : tr('Direct')
  const cardStyle = hasBackground
    ? 'border-separator/50 bg-surface/80 backdrop-blur-sm'
    : 'border-separator/60 bg-surface/85'
  const runtime = homeRuntimeState(
    !coreStopped && !coreError && Boolean(coreVersion),
    appConfig?.corePermissionMode,
    serviceState
  )
  const serviceFeatures = [
    appConfig?.sysProxy.enable ? tr('Proxy') : undefined,
    appConfig?.autoSetDNSMode === 'service' ? 'DNS' : undefined,
    routingStatus?.state === 'running'
      ? routingStatus.protectedApplicationCount === undefined
        ? tr('App routing')
        : tr('App routing ({0})', [routingStatus.protectedApplicationCount])
      : undefined
  ].filter((feature): feature is string => Boolean(feature))
  const mihomoVersionLabel = normalizeCoreVersion(coreVersion?.version)
  const serviceVersionLabel = displayServiceVersion(serviceVersion)

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
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{tr('Network')}</h2>
              {refreshingIp && <span className="text-xs text-muted">{tr('Refreshing')}</span>}
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <CountryFlag code={publicIp?.countryCode} className="size-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-muted">{countryLabel(publicIp)}</div>
                {publicIp ? (
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
                  <span className="text-xl font-semibold text-muted">{tr('Unavailable')}</span>
                )}
                {publicIpSnapshot.stale && publicIp && (
                  <div className="text-xs text-muted">{tr('Last known exit')}</div>
                )}
              </div>
            </div>
            {(publicIp?.isp || publicIp?.asn) && (
              <div className="mt-3 min-w-0 break-words text-xs text-muted">
                {[publicIp.isp, publicIp.asn].filter(Boolean).join(' · ')}
              </div>
            )}
            <div className="mt-4 flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="text-muted">
                {mode === 'global' ? tr('Current proxy') : tr('Routing')}
              </span>
              <div className="min-w-0 text-left sm:text-right">
                <div className="max-w-full break-words font-medium" title={proxyName}>
                  {proxyName ?? (mode === 'global' ? tr('Unavailable') : routingDetail)}
                </div>
                {proxyDetails && <div className="text-xs text-muted">{proxyDetails}</div>}
              </div>
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
                    <div className="text-xs text-muted">
                      {profile.kokoro
                        ? [
                            'Kokoro',
                            profile.kokoro.settings.protocol.toUpperCase(),
                            profile.kokoro.settings.mode === 'relay' ? tr('Relay') : tr('Direct')
                          ].join(' · ')
                        : profile.type === 'remote'
                          ? tr('Remote')
                          : tr('Local')}
                    </div>
                  </div>
                  {quota > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs tabular-nums text-muted">
                        <span>
                          {calcTraffic(usage)} / {calcTraffic(quota)}
                        </span>
                        <span>{tr('{0}% used', [Math.round((usage / quota) * 100)])}</span>
                      </div>
                      <Meter
                        aria-label={tr('Traffic usage')}
                        maxValue={quota}
                        value={Math.min(usage, quota)}
                      >
                        <Meter.Track className="h-1.5 bg-surface-secondary">
                          <Meter.Fill className="bg-accent" />
                        </Meter.Track>
                      </Meter>
                      <div className="text-xs text-muted">
                        {tr('{0} remaining', [calcTraffic(remainingQuota)])}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted">
                    {profile.extra?.expire ? (
                      <span>
                        {tr('Expires {0}', [dayjs.unix(profile.extra.expire).format('YYYY-MM-DD')])}
                      </span>
                    ) : null}
                    {profile.updated ? (
                      <span>{tr('Updated {0}', [dayjs(profile.updated).fromNow()])}</span>
                    ) : null}
                  </div>
                  {profile.type === 'remote' && (
                    <div className="text-xs text-muted">
                      {profile.autoUpdate === false
                        ? tr('Auto update off')
                        : nextUpdateAt !== undefined
                          ? nextUpdateAt <= now
                            ? tr('Update due')
                            : tr('Next update {0}', [dayjs(nextUpdateAt).fromNow()])
                          : null}
                    </div>
                  )}
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
              <div className="text-lg font-semibold">
                {coreLoading && !coreStopped
                  ? tr('Loading')
                  : runtime.mihomo === 'system-service'
                    ? tr('System service')
                    : runtime.mihomo === 'direct-run'
                      ? tr('Direct run')
                      : tr('Stopped')}
              </div>
              <div className="text-sm text-muted">
                Mihomo
                {mihomoVersionLabel && runtime.mihomo !== 'stopped' ? ` ${mihomoVersionLabel}` : ''}
                {' · '}
                {getOutboundModeLabel(mode)}
              </div>
              <div className="mt-4 flex min-w-0 items-center gap-2 text-xs">
                <span
                  className={`size-2 shrink-0 rounded-full ${serviceState === 'running' ? 'bg-success' : 'bg-muted'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 text-muted">{tr('KokoroBox Service')}</span>
                <span className="font-medium">
                  {serviceStateLabel(runtime.service as ServiceState | undefined)}
                </span>
              </div>
              {serviceState === 'running' &&
                (serviceVersionLabel || serviceFeatures.length > 0) && (
                  <div className="mt-1 space-y-0.5 pl-4 text-xs text-muted">
                    {serviceVersionLabel && <div>{serviceVersionLabel}</div>}
                    {serviceFeatures.length > 0 && (
                      <div>{tr('Configured: {0}', [serviceFeatures.join(' · ')])}</div>
                    )}
                  </div>
                )}
            </Surface>
          </div>

          <Surface className={`min-w-0 rounded-2xl border p-4 shadow-none sm:p-5 ${cardStyle}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{tr('Traffic')}</h2>
              <Link
                to="/connections"
                className="app-nodrag inline-flex items-center gap-1 text-xs text-muted hover:text-accent"
              >
                {connections?.connections
                  ? tr('{0} connections', [connections.connections.length])
                  : tr('Connections')}
                <LuArrowRight className="size-3" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 tabular-nums">
              <div className="min-w-0">
                <span className="flex items-center gap-1 text-xs text-muted">
                  <LuArrowDown /> {tr('Download')}
                </span>
                <div
                  className="truncate text-xl font-semibold"
                  title={`${calcTraffic(rates.down)}/s`}
                >
                  {calcTraffic(rates.down)}/s
                </div>
                <div className="text-xs text-muted">
                  {tr('{0} this session', [calcTraffic(connections?.downloadTotal ?? 0)])}
                </div>
              </div>
              <div className="min-w-0">
                <span className="flex items-center gap-1 text-xs text-muted">
                  <LuArrowUp /> {tr('Upload')}
                </span>
                <div
                  className="truncate text-xl font-semibold"
                  title={`${calcTraffic(rates.up)}/s`}
                >
                  {calcTraffic(rates.up)}/s
                </div>
                <div className="text-xs text-muted">
                  {tr('{0} this session', [calcTraffic(connections?.uploadTotal ?? 0)])}
                </div>
              </div>
            </div>
            {topApplication && (
              <div className="mt-3 flex min-w-0 items-baseline gap-1.5 text-xs text-muted">
                <span className="shrink-0">{tr('Top activity')}</span>
                <span aria-hidden="true">·</span>
                <span
                  className="min-w-0 truncate font-medium text-foreground"
                  title={topApplication.name}
                >
                  {topApplication.name}
                </span>
                <span className="shrink-0">· {calcTraffic(topApplication.speed)}/s</span>
              </div>
            )}
            <div className="relative mt-3 h-20 overflow-hidden" aria-hidden="true">
              {history.some(({ traffic }) => traffic > 0) ? (
                <TrafficChart data={history} />
              ) : (
                <div className="absolute inset-x-0 bottom-1 border-b border-separator/50" />
              )}
            </div>
          </Surface>
        </div>
      </main>
    </BasePage>
  )
}

export default Home
