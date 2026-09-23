import { Meter, Surface } from '@heroui/react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useEffect, useMemo, useState } from 'react'
import { LuArrowDown, LuArrowRight, LuArrowUp, LuTriangleAlert } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { getLocale, tr } from '../../../shared/i18n'
import {
  homeRuntimeState,
  maskPublicIp,
  type PublicIpInfo,
  type PublicIpSnapshot
} from '../../../shared/home'
import BasePage from '@renderer/components/base/base-page'
import { CountryFlag } from '@renderer/components/base/country-flag'
import TrafficChart from '@renderer/components/sider/traffic-chart'
import { getOutboundModeLabel } from '@renderer/components/sider/outbound-mode'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { calcTraffic } from '@renderer/utils/calc'
import {
  getAppRoutingStatus,
  getHomeBackgroundDataUrl,
  getHomePublicIp,
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
      refresh()
      void refreshCore()
      void refreshService()
    }
    const coreStoppedHandler = (): void => {
      setCoreStopped(true)
      setRates({ up: 0, down: 0 })
      setConnections(undefined)
      refresh()
    }
    const onVisible = (): void => {
      if (!document.hidden) refresh()
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
      (_event, info: ControllerConnections) => setConnections(info)
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
  const proxyName = mode === 'global' ? globalProxy.name : undefined
  const proxyDetails =
    mode === 'global'
      ? [globalProxy.protocol, globalProxy.latency ? `${globalProxy.latency} ms` : undefined]
          .filter(Boolean)
          .join(' · ')
      : undefined
  const routingDetail =
    mode === 'rule' ? `${getOutboundModeLabel(mode)} · ${tr('Selected dynamically')}` : tr('Direct')
  const cardStyle = hasBackground
    ? 'border-separator/50 bg-surface/80 backdrop-blur-sm'
    : 'border-separator/60 bg-surface/85'
  const runtime = homeRuntimeState(
    !coreStopped && !coreError && Boolean(coreVersion),
    appConfig?.corePermissionMode,
    serviceState
  )

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
              <div className="min-w-0">
                <div className="text-sm text-muted">{countryLabel(publicIp)}</div>
                {publicIp ? (
                  <button
                    type="button"
                    title={revealed ? tr('Hide IP address') : tr('Reveal IP address')}
                    aria-label={revealed ? tr('Hide IP address') : tr('Reveal IP address')}
                    aria-pressed={revealed}
                    onClick={() => setRevealed((current) => !current)}
                    className="app-nodrag -ml-1 max-w-full break-all rounded-md px-1 font-mono text-xl font-semibold text-foreground outline-offset-2 hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent sm:text-2xl"
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

          <div className="grid min-w-0 grid-cols-1 gap-3 @min-[560px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
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
                        ? tr('Kokoro subscription')
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
                        <span>{Math.round((usage / quota) * 100)}%</span>
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
                </div>
              ) : (
                <Link to="/profiles" className="app-nodrag text-sm text-muted hover:text-accent">
                  {tr('No subscription selected. Open subscriptions to choose one.')}
                </Link>
              )}
            </Surface>

            <Surface className={`min-w-0 rounded-2xl border p-4 shadow-none sm:p-5 ${cardStyle}`}>
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
              <div className="text-sm text-muted">Mihomo · {getOutboundModeLabel(mode)}</div>
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
            </Surface>
          </div>

          <Surface className={`min-w-0 rounded-2xl border p-4 shadow-none sm:p-5 ${cardStyle}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{tr('Traffic')}</h2>
              <Link to="/connections" className="app-nodrag text-xs text-muted hover:text-accent">
                {tr('Connections')} {connections?.connections?.length ?? '—'}
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
