import { tr } from '../../../../shared/i18n'
import { Button, Chip, Switch } from '@heroui/react'
import { KokoSelect, KokoTextField } from '../base/koko-form'
import BasePage from '@renderer/components/base/base-page'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { calcTraffic } from '@renderer/utils/calc'
import {
  addKokoroProfile,
  cancelKokoroLogin,
  getKokoroSession,
  revokeKokoroSession,
  startKokoroLogin
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import dayjs from 'dayjs'
import React, { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { LuCloudDownload, LuLogIn, LuLogOut, LuRefreshCw } from 'react-icons/lu'
import KokoroDefaultRules from './kokoro-default-rules'
import KokoroSectionHeading from './kokoro-section-heading'

const supportedProtocols = new Set<KokoroProtocol>(['vmess', 'anytls', 'hysteria2'])

function isKokoroProtocol(value: string): value is KokoroProtocol {
  return supportedProtocols.has(value as KokoroProtocol)
}

function utcDate(value: string): dayjs.Dayjs {
  return dayjs(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}

interface KokoroOptionSectionProps {
  title: string
  children: ReactNode
  footer?: ReactNode
}

const KokoroOptionSection = ({ title, children, footer }: KokoroOptionSectionProps) => {
  const headingId = useId()

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-separator/70 bg-surface transition-colors focus-within:border-accent/35"
    >
      <header className="border-b border-separator/70 px-4 py-3">
        <KokoroSectionHeading id={headingId} title={title} />
      </header>
      <div className="p-4">{children}</div>
      {footer ? (
        <footer className="flex items-center justify-end border-t border-separator/70 px-4 py-3">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}

const KokoroSettingsPage: React.FC = () => {
  const { mutateProfileConfig } = useProfileConfig()
  const [session, setSession] = useState<KokoroSession>()
  const [settings, setSettings] = useState<KokoroSubscriptionSettings>()
  const [loading, setLoading] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [importing, setImporting] = useState(false)

  const refreshProfiles = (): void => {
    mutateProfileConfig()
    window.electron.ipcRenderer.send('updateTrayMenu')
  }

  const refresh = async (): Promise<void> => {
    setLoading(true)
    try {
      setSession(await getKokoroSession())
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const listener = (): void => {
      setLoggingIn(false)
      void refresh()
    }
    window.electron.ipcRenderer.on('kokoro-auth-changed', listener)
    return (): void => {
      window.electron.ipcRenderer.removeListener('kokoro-auth-changed', listener)
      void cancelKokoroLogin().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const options = session?.options
    if (!options || settings) return
    const availableProtocols = options.protocols.map((item) => item.value).filter(isKokoroProtocol)
    const protocol = availableProtocols.includes(options.defaults.protocol as KokoroProtocol)
      ? (options.defaults.protocol as KokoroProtocol)
      : availableProtocols[0] || 'vmess'
    const protocolSupportsDirect = Boolean(
      options.protocols.find((item) => item.value === protocol)?.supports_direct
    )
    const plan =
      options.defaults.plan && options.plans.some((item) => item.name === options.defaults.plan)
        ? options.defaults.plan
        : options.plans[0]?.name || null
    setSettings({
      format: 'mihomo',
      protocol,
      plan,
      isp: null,
      mode: protocolSupportsDirect && options.defaults.mode === 'direct' ? 'direct' : 'relay',
      rule_source: options.rule_sources.includes(options.defaults.rule_source)
        ? (options.defaults.rule_source as KokoroRuleSource)
        : 'origin',
      final_route: options.final_routes.includes(options.defaults.final_route)
        ? (options.defaults.final_route as KokoroFinalRoute)
        : 'proxy',
      rule_provider_auto_update: options.defaults.rule_provider_auto_update,
      profile_auto_update: options.defaults.profile_auto_update,
      profile_update_hours: options.defaults.profile_update_hours
    })
  }, [session, settings])

  const options = session?.options
  const user = session?.user
  const protocols = useMemo(
    () => options?.protocols.filter((item) => isKokoroProtocol(item.value)) || [],
    [options]
  )
  const selectedProtocol = protocols.find((protocol) => protocol.value === settings?.protocol)
  const supportsDirect = Boolean(selectedProtocol?.supports_direct)
  const selectedPlan = options?.plans.find((plan) => plan.name === settings?.plan)
  const allowedISPValues = useMemo(() => {
    const supported = selectedPlan?.supported_isps || []
    if (supported.length === 0 || (supported.length === 1 && supported[0] === 'all')) {
      return new Set([''])
    }
    return new Set(['', ...supported])
  }, [selectedPlan])
  const isps = options?.isps.filter((isp) => allowedISPValues.has(isp.value)) || []
  const mihomoAvailable = Boolean(options?.formats.some((format) => format.value === 'mihomo'))
  const canImport = Boolean(settings?.plan && protocols.length > 0 && mihomoAvailable)

  const updateSettings = (patch: Partial<KokoroSubscriptionSettings>): void => {
    setSettings((current) => (current ? { ...current, ...patch } : current))
  }

  const handleLogin = async (): Promise<void> => {
    setLoggingIn(true)
    try {
      await startKokoroLogin()
    } catch (error) {
      setLoggingIn(false)
      notify(error, { variant: 'danger' })
    }
  }

  const handleLogout = async (): Promise<void> => {
    setLoading(true)
    try {
      await revokeKokoroSession()
      setSession({ authenticated: false })
      setSettings(undefined)
      refreshProfiles()
      notify(tr('Signed out of Kokoro and removed local Kokoro profile caches'), {
        variant: 'success'
      })
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async (): Promise<void> => {
    if (!settings || !canImport) return
    setImporting(true)
    try {
      await addKokoroProfile({
        ...settings,
        mode: supportsDirect ? settings.mode : 'relay',
        isp: settings.isp || null
      })
      refreshProfiles()
      notify(tr('Kokoro subscription added'), { variant: 'success' })
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <BasePage title={tr('Kokoro account and subscription')} contentClassName="no-scrollbar">
      <div className="kokoro-settings-guide mx-auto flex min-h-full w-full max-w-[1120px] flex-col px-4 py-5">
        {!session?.authenticated && (
          <header className="mb-5 border-b border-separator/70 pb-4">
            <h2 className="text-lg font-semibold">{tr('Kokoro subscription')}</h2>
            <p className="mt-1 text-xs text-muted">
              {tr('Sign in with osu! to securely fetch a Mihomo profile from Kokoro')}
            </p>
          </header>
        )}
        <div className="min-h-0 flex-1">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center">
              <LuRefreshCw className="animate-spin text-xl text-accent-soft-foreground" />
            </div>
          ) : !session?.authenticated || !user || !options ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-8 text-center">
              <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent-soft-foreground">
                <LuLogIn className="text-2xl" />
              </div>
              <h3 className="text-base font-semibold">{tr('Sign in to Kokoro')}</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
                {tr(
                  'Authorize with osu! in your system browser. Kokoro never sees your osu! password. Sign-in credentials are kept in system secure storage.'
                )}
              </p>
              <Button
                className="mt-6 min-w-36"
                variant="primary"
                isPending={loggingIn}
                onPress={handleLogin}
              >
                {!loggingIn ? <LuLogIn /> : null}
                {loggingIn ? tr('Waiting for authorization') : tr('Sign in with osu!')}
              </Button>
              {loggingIn && (
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    void cancelKokoroLogin().catch(() => {})
                  }}
                >
                  {tr('Cancel')}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <section className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-separator/70 pb-4">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-12 shrink-0 rounded-full bg-surface-secondary object-cover"
                  />
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-soft-foreground">
                    {(user.username || user.osu_id).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold">
                      {user.username || user.osu_id}
                    </h2>
                    {user.plans.map((plan) => (
                      <Chip key={plan} size="sm" color="accent" variant="soft">
                        {plan}
                      </Chip>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {user.bandwidth_limit === 0
                      ? tr('Used this month: {0} · Unlimited', [calcTraffic(user.traffic_usage)])
                      : tr('Used this month: {0} / {1}', [
                          calcTraffic(user.traffic_usage),
                          calcTraffic(user.bandwidth_limit)
                        ])}
                    {user.subscription_expires_at
                      ? tr(' · Expires {0}', [
                          utcDate(user.subscription_expires_at).format('YYYY-MM-DD')
                        ])
                      : tr(' · No expiration')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-muted data-[hover=true]:text-danger"
                  onPress={handleLogout}
                >
                  <LuLogOut className="text-danger" />
                  {tr('Sign out')}
                </Button>
              </section>

              <div className="grid min-h-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,1.08fr)]">
                <div className="flex min-w-0 flex-col gap-4">
                  {!mihomoAvailable && (
                    <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
                      {tr('Mihomo format is not available for this Kokoro account.')}
                    </p>
                  )}

                  <KokoroOptionSection
                    title={tr('Subscription options')}
                    footer={
                      <Button
                        size="sm"
                        variant="primary"
                        isDisabled={!canImport}
                        isPending={importing}
                        onPress={handleImport}
                      >
                        {!importing ? <LuCloudDownload /> : null}
                        {tr('Fetch and add')}
                      </Button>
                    }
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <KokoSelect
                        aria-label={tr('Plan')}
                        variant="secondary"
                        label={tr('Plan')}
                        labelPlacement="inside"
                        isDisabled={options.plans.length === 0}
                        disallowEmptySelection
                        options={options.plans.map((plan) => ({
                          id: plan.name,
                          label: plan.name,
                          description: plan.description || undefined,
                          textValue: plan.name
                        }))}
                        value={settings?.plan ?? ''}
                        onChange={(value) => updateSettings({ plan: value, isp: null })}
                      />
                      <KokoSelect
                        aria-label={tr('Internet provider')}
                        variant="secondary"
                        label={tr('Internet provider')}
                        labelPlacement="inside"
                        disallowEmptySelection
                        options={isps.map((isp) => ({
                          id: isp.value,
                          label: isp.label,
                          textValue: isp.label
                        }))}
                        value={settings?.isp ?? ''}
                        onChange={(value) =>
                          updateSettings({
                            isp: (value || null) as KokoroISP | null
                          })
                        }
                      />
                      <KokoSelect
                        aria-label={tr('Protocol')}
                        variant="secondary"
                        label={tr('Protocol')}
                        labelPlacement="inside"
                        disallowEmptySelection
                        options={protocols.map((protocol) => ({
                          id: protocol.value,
                          label: protocol.label,
                          textValue: protocol.label
                        }))}
                        value={settings?.protocol ?? ''}
                        onChange={(value) => {
                          const protocol = value as KokoroProtocol
                          updateSettings({
                            protocol,
                            mode: protocol === 'vmess' ? 'relay' : settings?.mode || 'relay'
                          })
                        }}
                      />
                      {!supportsDirect ? (
                        <div className="flex min-h-12 flex-col justify-center rounded-lg border border-separator/70 bg-surface-secondary px-3 py-1.5">
                          <span className="text-xs text-muted">{tr('Connection mode')}</span>
                          <span className="truncate text-sm text-muted">
                            {settings?.protocol === 'vmess'
                              ? tr('VMess always uses relay mode')
                              : tr('This protocol currently supports relay mode only')}
                          </span>
                        </div>
                      ) : (
                        <KokoSelect
                          aria-label={tr('Connection mode')}
                          variant="secondary"
                          label={tr('Connection mode')}
                          labelPlacement="inside"
                          disallowEmptySelection
                          options={[
                            { id: 'relay', label: tr('Relay') },
                            { id: 'direct', label: tr('Direct') }
                          ]}
                          value={settings?.mode ?? ''}
                          onChange={(value) => updateSettings({ mode: value as KokoroMode })}
                        />
                      )}
                      <KokoSelect
                        aria-label={tr('Rule source')}
                        variant="secondary"
                        label={tr('Rule source')}
                        labelPlacement="inside"
                        disallowEmptySelection
                        options={options.rule_sources.map((source) => ({
                          id: source,
                          label: source === 'origin' ? tr('Original source') : tr('Mirror')
                        }))}
                        value={settings?.rule_source ?? ''}
                        onChange={(value) =>
                          updateSettings({
                            rule_source: value as KokoroRuleSource
                          })
                        }
                      />
                      <KokoSelect
                        aria-label={tr('Unmatched traffic')}
                        variant="secondary"
                        label={tr('Unmatched traffic')}
                        labelPlacement="inside"
                        disallowEmptySelection
                        options={options.final_routes.map((route) => ({
                          id: route,
                          label: route === 'proxy' ? tr('Proxy') : tr('Direct')
                        }))}
                        value={settings?.final_route ?? ''}
                        onChange={(value) =>
                          updateSettings({
                            final_route: value as KokoroFinalRoute
                          })
                        }
                      />
                    </div>
                  </KokoroOptionSection>

                  <KokoroOptionSection title={tr('Update behavior')}>
                    <div className="divide-y divide-separator/70">
                      <div className="flex flex-wrap items-center justify-between gap-4 py-2 first:pt-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {tr('Update rule sets automatically')}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {tr('Update remote rule providers')}
                          </p>
                        </div>
                        <Switch
                          aria-label={tr('Update rule sets automatically')}
                          size="sm"
                          className="ml-auto shrink-0"
                          isSelected={settings?.rule_provider_auto_update}
                          onChange={(value) => updateSettings({ rule_provider_auto_update: value })}
                        >
                          <Switch.Content>
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch.Content>
                        </Switch>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-4 py-2 last:pb-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {tr('Update subscription automatically')}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {tr('Keep the last working configuration if an update fails')}
                          </p>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-3">
                          <KokoTextField
                            aria-label={tr('Update interval')}
                            type="number"
                            className="w-32 shrink-0"
                            min={options.profile_update.min_hours}
                            max={options.profile_update.max_hours}
                            suffix={
                              <span className="shrink-0 whitespace-nowrap">{tr('hours')}</span>
                            }
                            value={String(settings?.profile_update_hours || '')}
                            onChangeValue={(value) =>
                              updateSettings({
                                profile_update_hours: Math.min(
                                  options.profile_update.max_hours,
                                  Math.max(options.profile_update.min_hours, Number(value) || 0)
                                )
                              })
                            }
                          />
                          <Switch
                            aria-label={tr('Update subscription automatically')}
                            size="sm"
                            isSelected={settings?.profile_auto_update}
                            onChange={(value) => updateSettings({ profile_auto_update: value })}
                          >
                            <Switch.Content>
                              <Switch.Control>
                                <Switch.Thumb />
                              </Switch.Control>
                            </Switch.Content>
                          </Switch>
                        </div>
                      </div>
                    </div>
                  </KokoroOptionSection>
                </div>
                <KokoroDefaultRules />
              </div>
            </div>
          )}
        </div>
      </div>
    </BasePage>
  )
}

export default KokoroSettingsPage
