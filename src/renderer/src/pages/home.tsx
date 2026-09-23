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
  if (!info) return tr('Unavailable')
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
  const proxyName =
    mode === 'direct' ? tr('Direct') : mode === 'rule' ? tr('By rule') : globalProxy.name
  const proxyDetails =
    mode === 'global'
      ? [globalProxy.protocol, globalProxy.latency ? `${globalProxy.latency} ms` : undefined]
          .filter(Boolean)
          .join(' · ')
      : undefined
  const cardStyle = hasBackground ? 'bg-surface/90 backdrop-blur-sm' : ''
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
        <div className="relative mx-auto flex w-full max-w-[1000px] flex-col gap-4 px-4 py-5 sm:px-6 sm:py-7">
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

          <Surface variant="secondary" className={`min-w-0 rounded-2xl p-5 sm:p-6 ${cardStyle}`}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{tr('Network')}</h2>
              {refreshingIp && <span className="text-xs text-muted">{tr('Refreshing')}</span>}
            </div>
            <div className="flex min-w-0 flex-col items-center gap-2 text-center">
              <CountryFlag code={publicIp?.countryCode} className="size-12" />
              <span className="mt-1 text-xs text-muted">
                {publicIpSnapshot.stale && publicIp
                  ? tr('Last known exit')
                  : tr('Observed public exit')}
              </span>
              {publicIp ? (
                <button
                  type="button"
                  title={revealed ? tr('Hide IP address') : tr('Reveal IP address')}
                  aria-label={revealed ? tr('Hide IP address') : tr('Reveal IP address')}
                  aria-pressed={revealed}
                  onClick={() => setRevealed((current) => !current)}
                  className="app-nodrag max-w-full break-all rounded-md px-2 py-0.5 font-mono text-2xl font-semibold text-foreground outline-offset-2 hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {revealed ? publicIp.ip : maskPublicIp(publicIp.ip)}
                </button>
              ) : (
                <span className="text-2xl font-semibold text-muted">{tr('Unavailable')}</span>
              )}
              <span className="text-sm text-muted">{countryLabel(publicIp)}</span>
            </div>
            <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-separator/60 pt-4 text-sm">
              <span className="text-muted">{tr('Current proxy')}</span>
              <div className="min-w-0 text-left sm:text-right">
                <div className="max-w-full break-words font-medium" title={proxyName}>
                  {proxyName ?? tr('Unavailable')}
                </div>
                {proxyDetails && <div className="text-xs text-muted">{proxyDetails}</div>}
              </div>
            </div>
          </Surface>

          <div className="grid min-w-0 grid-cols-1 gap-4 @min-[700px]:grid-cols-2">
            <Surface variant="secondary" className={`min-w-0 rounded-2xl p-5 ${cardStyle}`}>
              <div className="mb-5 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{tr('Current subscription')}</h2>
                <Link
                  to="/profiles"
                  className="app-nodrag rounded-md p-1 text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                  aria-label={tr('Open subscriptions')}
                >
                  <LuArrowRight className="size-4" />
                </Link>
              </div>
              {profile ? (
                <div className="space-y-4">
                  <div className="min-w-0">
                    <div className="break-words text-lg font-semibold">{profile.name}</div>
                    <div className="text-sm text-muted">
                      {profile.kokoro
                        ? tr('Kokoro subscription')
                        : profile.type === 'remote'
                          ? tr('Remote')
                          : tr('Local')}
                    </div>
                  </div>
                  {quota > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm tabular-nums text-muted">
                        {calcTraffic(usage)} / {calcTraffic(quota)}
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
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {profile.extra?.expire ? (
                      <span>{tr('Expires {0}', [dayjs.unix(profile.extra.expire).fromNow()])}</span>
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

            <Surface variant="secondary" className={`min-w-0 rounded-2xl p-5 ${cardStyle}`}>
              <div className="mb-5 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{tr('Traffic')}</h2>
                <Link to="/connections" className="app-nodrag text-xs text-muted hover:text-accent">
                  {tr('Connections')}
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 tabular-nums">
                <div className="min-w-0">
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <LuArrowDown />
                    {tr('Download')}
                  </span>
                  <div
                    className="truncate text-lg font-semibold"
                    title={`${calcTraffic(rates.down)}/s`}
                  >
                    {calcTraffic(rates.down)}/s
                  </div>
                </div>
                <div className="min-w-0">
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <LuArrowUp />
                    {tr('Upload')}
                  </span>
                  <div
                    className="truncate text-lg font-semibold"
                    title={`${calcTraffic(rates.up)}/s`}
                  >
                    {calcTraffic(rates.up)}/s
                  </div>
                </div>
              </div>
              <div className="relative mt-4 h-10 overflow-hidden rounded-lg bg-surface-secondary/40">
                <TrafficChart data={history} />
              </div>
              <div className="mt-4 border-t border-separator/60 pt-3 text-xs text-muted">
                <div className="mb-1 font-medium">{tr('This session')}</div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 tabular-nums">
                  <span>↓ {calcTraffic(connections?.downloadTotal ?? 0)}</span>
                  <span>↑ {calcTraffic(connections?.uploadTotal ?? 0)}</span>
                </div>
              </div>
            </Surface>
          </div>

          <Surface variant="secondary" className={`min-w-0 rounded-2xl p-5 ${cardStyle}`}>
            <h2 className="mb-4 text-base font-semibold">{tr('Runtime')}</h2>
            <dl className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-4 text-sm @min-[620px]:grid-cols-2">
              <div className="flex min-w-0 justify-between gap-4">
                <dt className="text-muted">{tr('Mihomo runtime')}</dt>
                <dd className="text-right font-medium">
                  {coreLoading && !coreStopped
                    ? tr('Loading')
                    : runtime.mihomo === 'system-service'
                      ? tr('System service')
                      : runtime.mihomo === 'direct-run'
                        ? tr('Direct run')
                        : tr('Stopped')}
                </dd>
              </div>
              <div className="flex min-w-0 justify-between gap-4">
                <dt className="text-muted">{tr('Mode')}</dt>
                <dd className="font-medium">{getOutboundModeLabel(mode)}</dd>
              </div>
              <div className="flex min-w-0 justify-between gap-4">
                <dt className="text-muted">{tr('KokoroBox Service')}</dt>
                <dd className={`font-medium ${serviceState === 'running' ? 'text-success' : ''}`}>
                  {serviceStateLabel(runtime.service as ServiceState | undefined)}
                </dd>
              </div>
              <div className="flex min-w-0 justify-between gap-4">
                <dt className="text-muted">{tr('Active connections')}</dt>
                <dd className="font-medium tabular-nums">
                  {connections?.connections?.length ?? '—'}
                </dd>
              </div>
            </dl>
          </Surface>
        </div>
      </main>
    </BasePage>
  )
}

export default Home
