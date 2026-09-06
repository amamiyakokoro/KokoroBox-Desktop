import { tr } from '../../../../shared/i18n'
import { Button, Chip, Input, Select, SelectItem, Switch } from '@heroui/react'
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
import React, { useEffect, useMemo, useState } from 'react'
import { LuCloudDownload, LuLogIn, LuLogOut, LuRefreshCw } from 'react-icons/lu'
import KokoroDefaultRules from './kokoro-default-rules'

const supportedProtocols = new Set<KokoroProtocol>(['vmess', 'anytls', 'hysteria2'])

function isKokoroProtocol(value: string): value is KokoroProtocol {
  return supportedProtocols.has(value as KokoroProtocol)
}

function utcDate(value: string): dayjs.Dayjs {
  return dayjs(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
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
      notify(tr('已退出 Kokoro，并移除本地 Kokoro 配置缓存'), { variant: 'success' })
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
      notify(tr('Kokoro 订阅已添加'), { variant: 'success' })
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <BasePage title={tr('Kokoro 设置')} contentClassName="no-scrollbar">
      <div className="kokoro-settings-guide mx-auto flex min-h-full w-full max-w-[1120px] flex-col px-4 py-5">
        <header className="mb-5 border-b border-default-100 pb-4">
          <h2 className="text-lg font-semibold">{tr('Kokoro 订阅')}</h2>
          <p className="mt-1 text-xs text-foreground-500">
            {tr('通过 osu! 登录，并从 Kokoro 安全获取 Mihomo 配置')}
          </p>
        </header>
        <div className="min-h-0 flex-1">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center">
              <LuRefreshCw className="animate-spin text-xl text-primary" />
            </div>
          ) : !session?.authenticated || !user || !options ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-8 text-center">
              <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LuLogIn className="text-2xl" />
              </div>
              <h3 className="text-base font-semibold">{tr('登录 Kokoro')}</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-foreground-500">
                {tr(
                  '将在系统浏览器中完成 osu! 授权。Kokoro 不会接触 osu! 密码，登录凭据保存在系统安全存储中。'
                )}
              </p>
              <Button
                className="mt-6 min-w-36"
                color="primary"
                isLoading={loggingIn}
                onPress={handleLogin}
                startContent={!loggingIn ? <LuLogIn /> : undefined}
              >
                {loggingIn ? tr('等待浏览器授权') : tr('使用 osu! 登录')}
              </Button>
              {loggingIn && (
                <Button
                  size="sm"
                  variant="light"
                  onPress={() => {
                    void cancelKokoroLogin().catch(() => {})
                  }}
                >
                  {tr('取消')}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <section className="flex items-start gap-3 border-b border-default-100 pb-5">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-11 shrink-0 rounded-full bg-default-100 object-cover"
                  />
                ) : (
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                    {(user.username || user.osu_id).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{user.username || user.osu_id}</h3>
                    {user.plans.map((plan) => (
                      <Chip key={plan} size="sm" color="primary" variant="flat">
                        {plan}
                      </Chip>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-foreground-500">
                    {user.bandwidth_limit === 0
                      ? tr('本月已用 {0} · 不限流量', [calcTraffic(user.traffic_usage)])
                      : tr('本月已用 {0} / {1}', [
                          calcTraffic(user.traffic_usage),
                          calcTraffic(user.bandwidth_limit)
                        ])}
                    {user.subscription_expires_at
                      ? tr(' · {0} 到期', [
                          utcDate(user.subscription_expires_at).format('YYYY-MM-DD')
                        ])
                      : tr(' · 长期有效')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  className="shrink-0"
                  onPress={handleLogout}
                  startContent={<LuLogOut />}
                >
                  {tr('登出')}
                </Button>
              </section>

              <div className="grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,1.08fr)]">
                <div className="flex min-w-0 flex-col gap-5">
                  {!mihomoAvailable && (
                    <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">
                      {tr('当前 Kokoro 帐号没有可用的 Mihomo 格式。')}
                    </p>
                  )}

                  <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Select
                      label={tr('方案')}
                      size="sm"
                      selectedKeys={settings?.plan ? new Set([settings.plan]) : new Set()}
                      isDisabled={options.plans.length === 0}
                      disallowEmptySelection
                      onSelectionChange={(value) =>
                        updateSettings({ plan: String(value.currentKey), isp: null })
                      }
                    >
                      {options.plans.map((plan) => (
                        <SelectItem key={plan.name} description={plan.description || undefined}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </Select>
                    <Select
                      label={tr('网络运营商')}
                      size="sm"
                      selectedKeys={new Set([settings?.isp || ''])}
                      disallowEmptySelection
                      onSelectionChange={(value) =>
                        updateSettings({
                          isp: (String(value.currentKey) || null) as KokoroISP | null
                        })
                      }
                    >
                      {isps.map((isp) => (
                        <SelectItem key={isp.value}>{isp.label}</SelectItem>
                      ))}
                    </Select>
                    <Select
                      label={tr('协议')}
                      size="sm"
                      selectedKeys={settings ? new Set([settings.protocol]) : new Set()}
                      disallowEmptySelection
                      onSelectionChange={(value) => {
                        const protocol = String(value.currentKey) as KokoroProtocol
                        updateSettings({
                          protocol,
                          mode: protocol === 'vmess' ? 'relay' : settings?.mode || 'relay'
                        })
                      }}
                    >
                      {protocols.map((protocol) => (
                        <SelectItem key={protocol.value}>{protocol.label}</SelectItem>
                      ))}
                    </Select>
                    {!supportsDirect ? (
                      <div className="flex min-h-12 items-center rounded-lg bg-default-100 px-3 text-sm text-foreground-500">
                        {settings?.protocol === 'vmess'
                          ? tr('VMess 固定使用中继模式')
                          : tr('此协议当前仅支持中继模式')}
                      </div>
                    ) : (
                      <Select
                        label={tr('连接模式')}
                        size="sm"
                        selectedKeys={settings ? new Set([settings.mode]) : new Set()}
                        disallowEmptySelection
                        onSelectionChange={(value) =>
                          updateSettings({ mode: String(value.currentKey) as KokoroMode })
                        }
                      >
                        <SelectItem key="relay">{tr('中继')}</SelectItem>
                        <SelectItem key="direct">{tr('直连')}</SelectItem>
                      </Select>
                    )}
                    <Select
                      label={tr('规则来源')}
                      size="sm"
                      selectedKeys={settings ? new Set([settings.rule_source]) : new Set()}
                      disallowEmptySelection
                      onSelectionChange={(value) =>
                        updateSettings({
                          rule_source: String(value.currentKey) as KokoroRuleSource
                        })
                      }
                    >
                      {options.rule_sources.map((source) => (
                        <SelectItem key={source}>
                          {source === 'origin' ? tr('原始来源') : tr('镜像')}
                        </SelectItem>
                      ))}
                    </Select>
                    <Select
                      label={tr('未匹配流量')}
                      size="sm"
                      selectedKeys={settings ? new Set([settings.final_route]) : new Set()}
                      disallowEmptySelection
                      onSelectionChange={(value) =>
                        updateSettings({
                          final_route: String(value.currentKey) as KokoroFinalRoute
                        })
                      }
                    >
                      {options.final_routes.map((route) => (
                        <SelectItem key={route}>
                          {route === 'proxy' ? tr('代理') : tr('直连')}
                        </SelectItem>
                      ))}
                    </Select>
                  </section>

                  <section className="divide-y divide-default-100 border-y border-default-100">
                    <div className="flex flex-wrap items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{tr('规则集自动更新')}</p>
                        <p className="mt-0.5 text-xs text-foreground-500">
                          {tr('更新远端 rule-provider')}
                        </p>
                      </div>
                      <Switch
                        size="sm"
                        className="ml-auto shrink-0"
                        isSelected={settings?.rule_provider_auto_update}
                        onValueChange={(value) =>
                          updateSettings({ rule_provider_auto_update: value })
                        }
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{tr('订阅自动更新')}</p>
                        <p className="mt-0.5 text-xs text-foreground-500">
                          {tr('失败时保留上一份可用配置')}
                        </p>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-3">
                        <Input
                          aria-label={tr('更新间隔')}
                          type="number"
                          size="sm"
                          className="w-32 shrink-0"
                          min={options.profile_update.min_hours}
                          max={options.profile_update.max_hours}
                          endContent={
                            <span className="shrink-0 whitespace-nowrap">{tr('小时')}</span>
                          }
                          value={String(settings?.profile_update_hours || '')}
                          onValueChange={(value) =>
                            updateSettings({
                              profile_update_hours: Math.min(
                                options.profile_update.max_hours,
                                Math.max(options.profile_update.min_hours, Number(value) || 0)
                              )
                            })
                          }
                        />
                        <Switch
                          size="sm"
                          isSelected={settings?.profile_auto_update}
                          onValueChange={(value) => updateSettings({ profile_auto_update: value })}
                        />
                      </div>
                    </div>
                  </section>
                </div>
                <KokoroDefaultRules />
              </div>
            </div>
          )}
        </div>
        {session?.authenticated && user && options && !loading ? (
          <footer className="mt-5 flex justify-end border-t border-default-100 pt-4">
            <Button
              size="sm"
              color="primary"
              isDisabled={!canImport}
              isLoading={importing}
              onPress={handleImport}
              startContent={!importing ? <LuCloudDownload /> : undefined}
            >
              {tr('获取并添加')}
            </Button>
          </footer>
        ) : null}
      </div>
    </BasePage>
  )
}

export default KokoroSettingsPage
