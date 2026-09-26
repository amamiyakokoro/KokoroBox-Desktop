import { OverviewTrafficCard } from '@renderer/components/home/traffic-card'
import { Button, Surface, Tooltip } from '@heroui/react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuArrowRight,
  LuCalendarDays,
  LuClock3,
  LuCpu,
  LuImages,
  LuRefreshCw,
  LuTriangleAlert
} from 'react-icons/lu'
import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { getLocale, tr } from '../../../shared/i18n'
import { isAppRoutingRuleEffectivelyEnabled } from '../../../shared/app-routing'
import {
  displayServiceVersion,
  homeBackgroundChoice,
  homeNetworkCardBackgroundChoice,
  homeRuntimeState,
  isManagedHomeBackgroundFile,
  resolveHomeBackground,
  type PublicIpInfo,
  type PublicIpSnapshot
} from '../../../shared/home'
import BasePage from '@renderer/components/base/base-page'
import { CountryFlag } from '@renderer/components/base/country-flag'
import { normalizeCoreVersion } from '@renderer/components/sider/core-version'
import {
  OverviewMetadataRow,
  OverviewPublicIp,
  OverviewRoutingChip,
  OverviewActiveChips,
  OverviewConfiguredChips,
  OverviewStat,
  OverviewStatusLine,
  OverviewSubscriptionIdentity,
  OverviewUsageSummary
} from '@renderer/components/home/overview-parts'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useSysProxyOperation } from '@renderer/hooks/use-sysproxy-operation'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { useHomeDefaultBackgroundSwitch } from '@renderer/hooks/use-home-default-background'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { activeOverviewFeatures, configuredOverviewFeatures } from '@renderer/utils/home-overview'
import { platform } from '@renderer/utils/init'
import { notify } from '@renderer/utils/notification'
import {
  repairServiceAndPromptRestart,
  useServiceRepairState
} from '@renderer/utils/service-repair'
import { nextProfileUpdateAt } from '../../../shared/profile-update'
import { systemCoreOnlyBuild } from '../../../shared/build-flags'
import { homeBuiltInImages } from '@renderer/utils/home-background-assets'
import {
  getAppRoutingStatus,
  getAppRoutingConfig,
  getHomeBackgroundDataUrl,
  getNetworkCardBackgroundDataUrl,
  getHomePublicIp,
  getHomeServiceVersion,
  getRuntimeConfig,
  getSystemProxyEnabled,
  mihomoConfig,
  mihomoVersion,
  relaunchApp,
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
  const systemProxyOperation = useSysProxyOperation()
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
  const { data: observedSystemProxyEnabled } = useSWR(
    serviceState === 'running' ? ['homeSystemProxyEnabled', systemProxyOperation.revision] : null,
    getSystemProxyEnabled,
    { refreshInterval: 5000 }
  )
  const { data: routingStatus } = useSWR('sidebarAppRoutingStatus', getAppRoutingStatus, {
    refreshInterval: 5000
  })
  const { data: routingConfig } = useSWR('sidebarAppRoutingConfig', getAppRoutingConfig, {
    refreshInterval: 5000
  })
  const [publicIpSnapshot, setPublicIpSnapshot] = useState<PublicIpSnapshot>({ stale: true })
  const publicIp = publicIpSnapshot.info
  const [refreshingIp, setRefreshingIp] = useState(false)
  const { repairing: repairingService, restartRequired: serviceRestartRequired } =
    useServiceRepairState()
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [backgroundUrl, setBackgroundUrl] = useState<string>()
  const [networkCardBackground, setNetworkCardBackground] = useState<{
    file: string
    url: string
  }>()
  const [coreStopped, setCoreStopped] = useState(false)
  const [coreEpoch, setCoreEpoch] = useState(0)
  const runtimeQueryKey = !coreStopped && !coreError && coreVersion ? coreEpoch : null
  const { data: controllerRuntime, error: controllerRuntimeError } = useSWR(
    runtimeQueryKey === null ? null : ['homeControllerRuntime', runtimeQueryKey],
    mihomoConfig,
    { refreshInterval: 10_000 }
  )
  const { data: generatedRuntime, error: generatedRuntimeError } = useSWR(
    runtimeQueryKey === null ? null : ['homeGeneratedRuntime', runtimeQueryKey],
    getRuntimeConfig,
    { refreshInterval: 10_000 }
  )
  const [now, setNow] = useState(Date.now())
  const observedIp = useRef<string | undefined>(undefined)
  const ipRequestGeneration = useRef(0)
  const previousMode = useRef<OutboundMode | undefined>(undefined)
  const previousSelections = useRef<string | undefined>(undefined)
  const mode = controledMihomoConfig?.mode ?? 'rule'
  const globalProxy = useMemo(() => selectedGlobalProxy(groups), [groups])
  const selectedProxyKey = useMemo(() => {
    const selections = groups
      .filter((group) => group.now)
      .map((group) => [group.name, group.now])
      .sort(([left], [right]) => left.localeCompare(right))
    return selections.length > 0 ? JSON.stringify(selections) : undefined
  }, [groups])
  const profile = profileConfig?.items.find((item) => item.id === profileConfig.current)
  const background = appConfig?.homeBackground
  const backgroundChoice = homeBackgroundChoice(appConfig)
  const {
    selectedId,
    isDefault,
    pending: backgroundSwitchPending,
    switchSelectedBackground
  } = useHomeDefaultBackgroundSwitch()
  const resolvedBackground = resolveHomeBackground(
    appConfig ? { ...appConfig, homeDefaultBackgroundId: selectedId } : undefined,
    backgroundUrl,
    homeBuiltInImages
  )
  const hasActiveBackground = Boolean(resolvedBackground.imageUrl)
  const networkCardBackgroundFile = appConfig?.homeNetworkCardBackgroundFile
  const networkCardImageUrl =
    homeNetworkCardBackgroundChoice(appConfig?.homeNetworkCardBackground) === 'custom' &&
    networkCardBackground?.file === networkCardBackgroundFile
      ? networkCardBackground?.url
      : undefined
  const hasNetworkCardBackground = Boolean(networkCardImageUrl)

  useEffect(() => {
    if (backgroundChoice !== 'custom' || !background?.file) {
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
  }, [background?.file, backgroundChoice])

  useEffect(() => {
    if (!isManagedHomeBackgroundFile(networkCardBackgroundFile)) {
      setNetworkCardBackground(undefined)
      return
    }
    let active = true
    void getNetworkCardBackgroundDataUrl()
      .then((url) => {
        if (active) {
          setNetworkCardBackground(url ? { file: networkCardBackgroundFile, url } : undefined)
        }
      })
      .catch(() => {
        if (active) setNetworkCardBackground(undefined)
      })
    return () => {
      active = false
    }
  }, [networkCardBackgroundFile])

  useEffect(() => {
    const refresh = (): void => setRefreshSignal((current) => current + 1)
    const coreStarted = (): void => {
      setCoreStopped(false)
      setCoreEpoch((epoch) => epoch + 1)
      refresh()
      void refreshCore()
      void refreshService()
    }
    const coreStoppedHandler = (): void => {
      setCoreStopped(true)
      setCoreEpoch((epoch) => epoch + 1)
      refresh()
    }
    const onVisible = (): void => {
      if (!document.hidden) {
        const currentTime = Date.now()
        setNow(currentTime)
      }
    }
    const removeNetwork = window.electron.ipcRenderer.on('homeNetworkChanged', refresh)
    const removeCore = window.electron.ipcRenderer.on('core-started', coreStarted)
    const removeCoreStopped = window.electron.ipcRenderer.on('core-stopped', coreStoppedHandler)
    document.addEventListener('visibilitychange', onVisible)
    void startHomeNetworkObservation()
    return () => {
      removeNetwork()
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
    if (!controledMihomoConfig) return
    if (previousMode.current && previousMode.current !== mode) {
      setRefreshSignal((current) => current + 1)
    }
    previousMode.current = mode
  }, [controledMihomoConfig, mode])

  useEffect(() => {
    if (!selectedProxyKey) return
    if (previousSelections.current && previousSelections.current !== selectedProxyKey) {
      setRefreshSignal((current) => current + 1)
    }
    previousSelections.current = selectedProxyKey
  }, [selectedProxyKey])

  useEffect(() => {
    let active = true
    const generation = ++ipRequestGeneration.current
    void getHomePublicIp()
      .then((next) => {
        if (!active || generation !== ipRequestGeneration.current) return
        observedIp.current = next.info?.ip
        setPublicIpSnapshot(next)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (refreshSignal === 0) return
    let active = true
    const timer = window.setTimeout(() => {
      const generation = ++ipRequestGeneration.current
      setRefreshingIp(true)
      void getHomePublicIp(true)
        .then((next) => {
          if (!active || generation !== ipRequestGeneration.current) return
          if (observedIp.current !== next.info?.ip) {
            observedIp.current = next.info?.ip
            setRevealed(false)
          }
          setPublicIpSnapshot(next)
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
  }, [refreshSignal])

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
  const cardStyle = hasActiveBackground ? 'border-separator/50 shadow-none' : 'home-overview-card'
  const cardBackgroundStyle = hasActiveBackground
    ? {
        backgroundColor: `color-mix(in srgb, var(--surface) ${resolvedBackground.cardOpacity}%, transparent)`,
        backdropFilter: 'blur(1px)'
      }
    : undefined
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
    appRoutingConfigured: routingConfig?.enabled === true,
    configuredRuleCount: routingConfig?.rules.filter((rule) =>
      isAppRoutingRuleEffectivelyEnabled(routingConfig, rule)
    ).length
  })
  const activeFeatures = activeOverviewFeatures({
    coreRunning: runtime.mihomo !== 'stopped',
    tunEnabled: controllerRuntime?.tun?.enable,
    dnsEnabled: generatedRuntime?.dns?.enable,
    dnsMode: generatedRuntime?.dns?.['enhanced-mode'],
    systemProxyConfirmed: observedSystemProxyEnabled ?? systemProxyOperation.confirmed,
    appRoutingRunning: routingStatus?.state === 'running' && routingStatus.mihomoAvailable
  })
  const runtimeFeaturesLoading =
    runtime.mihomo !== 'stopped' &&
    (!controllerRuntime || !generatedRuntime) &&
    !controllerRuntimeError &&
    !generatedRuntimeError
  const runtimeFeaturesUnavailable = Boolean(controllerRuntimeError || generatedRuntimeError)
  const mihomoVersionLabel = normalizeCoreVersion(coreVersion?.version)
  const serviceVersionLabel = displayServiceVersion(serviceVersion)
  const exitIsLastKnown = publicIpSnapshot.stale || (!coreLoading && runtime.mihomo === 'stopped')
  const serviceTone =
    serviceState === 'running'
      ? 'success'
      : serviceState === 'requires-approval' || serviceState === 'need-init'
        ? 'warning'
        : serviceExpected && serviceState
          ? 'danger'
          : 'neutral'
  const serviceRepairAvailable =
    !systemCoreOnlyBuild &&
    (serviceState === 'not-installed' || (serviceExpected && serviceState === 'unknown'))
  const handleRepairService = async (): Promise<void> => {
    try {
      await repairServiceAndPromptRestart()
      void refreshService()
    } catch (error) {
      notify(error, { variant: 'danger' })
    }
  }

  return (
    <BasePage
      title={tr('Overview')}
      contentClassName="overflow-x-hidden home-overview-page"
      header={
        isDefault ? (
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                className="app-nodrag"
                aria-label={tr('Switch default background')}
                isDisabled={backgroundSwitchPending}
                onPress={() => void switchSelectedBackground()}
              >
                <LuImages className="text-base" aria-hidden="true" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom">{tr('Switch default background')}</Tooltip.Content>
          </Tooltip>
        ) : undefined
      }
    >
      <main className="@container relative min-h-full min-w-0 overflow-clip">
        {hasActiveBackground && (
          <div
            className="home-background-plane pointer-events-none sticky top-0 overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${resolvedBackground.imageUrl})`,
                backgroundSize: resolvedBackground.scale
                  ? resolvedBackground.source === 'default'
                    ? 'auto min(100%, 900px)'
                    : resolvedBackground.fit
                  : 'auto',
                backgroundPosition: resolvedBackground.position,
                backgroundRepeat: 'no-repeat',
                opacity: resolvedBackground.opacity / 100,
                filter: `blur(${resolvedBackground.blur}px)`,
                transform: resolvedBackground.blur ? 'scale(1.04)' : undefined
              }}
            />
            <div
              className="absolute inset-0 bg-surface"
              style={{ opacity: resolvedBackground.overlay / 100 }}
            />
          </div>
        )}
        <div
          className={`home-overview relative mx-auto flex w-full max-w-[1000px] flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5 ${hasActiveBackground ? 'home-overview-with-background' : ''}`}
        >
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
            className={`home-network-hero min-w-0 rounded-2xl border p-4 sm:p-5 ${cardStyle} ${hasNetworkCardBackground ? 'home-network-hero--custom-background' : ''}`}
            style={
              hasNetworkCardBackground ? { backgroundColor: 'var(--surface)' } : cardBackgroundStyle
            }
          >
            {hasNetworkCardBackground && (
              <div
                className="home-network-background pointer-events-none"
                style={{ backgroundImage: `url(${networkCardImageUrl})` }}
                aria-hidden="true"
              />
            )}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{tr('Network')}</h2>
              {exitIsLastKnown && publicIp ? (
                <span className="text-xs text-warning">{tr('Last known exit')}</span>
              ) : refreshingIp ? (
                <span className="text-xs text-muted">{tr('Refreshing')}</span>
              ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-2.5">
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
                <div className="home-secondary-value mt-0.5 text-[0.95rem] text-muted">
                  {countryLabel(publicIp)}
                </div>
                {(publicIp?.isp || publicIp?.asn) && (
                  <div className="home-secondary-value mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs text-muted">
                    {publicIp.isp && <span className="min-w-0 break-words">{publicIp.isp}</span>}
                    {publicIp.isp && publicIp.asn && <span aria-hidden="true">·</span>}
                    {publicIp.asn && <span className="shrink-0">{publicIp.asn}</span>}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-separator/40 pt-3">
              <span className="text-xs font-medium text-muted">{tr('Routing')}</span>
              <OverviewRoutingChip mode={mode} />
              {mode === 'rule' && (
                <span className="home-secondary-value text-xs text-muted">
                  {tr('Selected by routing rules')}
                </span>
              )}
              {mode === 'global' && (
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <span
                    className="max-w-full truncate text-xs font-medium"
                    title={globalProxy.name}
                  >
                    {globalProxy.name ?? tr('Unavailable')}
                  </span>
                  {(globalProxy.protocol || globalProxy.latency !== undefined) && (
                    <span className="home-secondary-value text-xs text-muted">
                      {[
                        globalProxy.protocol,
                        globalProxy.latency !== undefined ? `${globalProxy.latency} ms` : undefined
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
              )}
              {mode === 'direct' && (
                <span className="home-secondary-value text-xs text-muted">
                  {tr('Direct connection')}
                </span>
              )}
            </div>
          </Surface>

          <div className="home-overview-pair min-w-0">
            <Surface
              className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${cardStyle}`}
              style={cardBackgroundStyle}
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {tr('Current subscription')}
                </h2>
                <Link
                  to="/profiles"
                  className="app-nodrag rounded-md p-1 text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                  aria-label={tr('Open subscriptions')}
                >
                  <LuArrowRight className="size-4" />
                </Link>
              </div>
              {profile ? (
                <div className="space-y-2">
                  <OverviewSubscriptionIdentity profile={profile} />
                  <OverviewUsageSummary usage={usage} quota={quota} />
                  <dl className="space-y-0 pt-1">
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

            <Surface
              className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${cardStyle}`}
              style={cardBackgroundStyle}
            >
              <h2 className="mb-4 text-sm font-semibold text-foreground">{tr('Runtime')}</h2>
              <OverviewStat
                icon={
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft/55 text-accent">
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
              <div className="mt-4">
                <div className="mb-1 text-xs text-muted">{tr('Current status')}</div>
                {activeFeatures.length > 0 ? (
                  <OverviewActiveChips features={activeFeatures} />
                ) : (
                  <div className="home-secondary-value text-xs text-muted">
                    {runtimeFeaturesLoading
                      ? tr('Loading')
                      : runtimeFeaturesUnavailable
                        ? tr('Unavailable')
                        : tr('No active features confirmed')}
                  </div>
                )}
              </div>
              <div className="home-overview-subpanel mt-4 rounded-xl px-3 py-2.5">
                <OverviewStatusLine
                  label={tr('KokoroBox Service')}
                  status={
                    serviceExpected && serviceState === 'unknown'
                      ? tr('The service may not be installed')
                      : serviceStateLabel(runtime.service as ServiceState | undefined)
                  }
                  tone={serviceTone}
                  version={serviceState === 'running' ? serviceVersionLabel : undefined}
                />
                {(serviceRepairAvailable || serviceRestartRequired) && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                    {serviceRestartRequired && (
                      <span className="text-xs text-muted">
                        {tr('Restart KokoroBox to apply the service repair.')}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      isPending={repairingService}
                      isDisabled={repairingService}
                      onPress={() => {
                        if (serviceRestartRequired) {
                          void relaunchApp().catch((error) => notify(error, { variant: 'danger' }))
                        } else {
                          void handleRepairService()
                        }
                      }}
                    >
                      {serviceRestartRequired ? tr('Restart app') : tr('Repair service')}
                    </Button>
                  </div>
                )}
                {configuredFeatures.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-xs text-muted">{tr('Configured')}</div>
                    <OverviewConfiguredChips features={configuredFeatures} />
                  </div>
                )}
              </div>
            </Surface>
          </div>

          <OverviewTrafficCard
            hasActiveBackground={hasActiveBackground}
            cardOpacity={resolvedBackground.cardOpacity}
            runtimeStopped={runtime.mihomo === 'stopped'}
          />
        </div>
      </main>
    </BasePage>
  )
}

export default Home
