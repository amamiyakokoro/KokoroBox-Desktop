import { tr } from '../../../../../shared/i18n'
import { Button, Switch, Tooltip } from '@heroui/react'
import { KokoTextField } from '@renderer/components/base/koko-form'
import { KokoSegmentedControl } from '@renderer/components/base/base-controls'
import BasePage from '@renderer/components/base/base-page'
import SettingItem from '@renderer/components/base/base-setting-item'
import FeatureSettingsLayout, {
  FeatureSettingsPanelAction,
  FeatureSettingsSaveButton,
  FeatureSettingsSection
} from '@renderer/components/base/base-feature-settings'
import EditableList from '@renderer/components/base/base-list-editor'
import AdvancedDnsSetting from '@renderer/components/dns/advanced-dns-setting'
import { advancedDnsSettingIds } from '@renderer/components/dns/advanced-dns-setting-ids'
import DnsServerList from '@renderer/components/dns/dns-server-list'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { restartCore } from '@renderer/utils/ipc'
import React, { useState } from 'react'
import { notify } from '@renderer/utils/notification'
import {
  isValidIPv4Cidr,
  isValidIPv6Cidr,
  isValidDomainWildcard,
  isValidDnsServer
} from '@renderer/utils/validate'
import { useSettingsSave } from '@renderer/hooks/use-settings-save'
import { useUnsavedChangesGuard } from '@renderer/hooks/use-unsaved-changes'
import { useSearchParams } from 'react-router-dom'
import {
  applyDnsPreset,
  defaultDnsFakeIpFilter,
  getDnsPresetMode,
  type DnsPresetMode
} from '../../../../../shared/dns-presets'

interface Props {
  embedded?: boolean
}

const DNS: React.FC<Props> = ({ embedded = false }) => {
  const [searchParams] = useSearchParams()
  const requestedSetting = searchParams.get('setting')
  const advancedSetting = Object.values(advancedDnsSettingIds).some(
    (settingId) => settingId === requestedSetting
  )
    ? requestedSetting
    : null
  const { controledMihomoConfig, patchControledMihomoConfigOrThrow } = useControledMihomoConfig()
  const { appConfig, patchAppConfigOrThrow } = useAppConfig()
  const { hosts, controlDns = true } = appConfig || {}
  const { dns } = controledMihomoConfig || {}
  const {
    ipv6 = false,
    'fake-ip-range': fakeIPRange = '198.18.0.1/16',
    'fake-ip-range6': fakeIPRange6 = '',
    'fake-ip-filter': fakeIPFilter = defaultDnsFakeIpFilter,
    'enhanced-mode': enhancedMode = 'fake-ip',
    'fake-ip-filter-mode': fakeIPFilterMode = 'blacklist',
    'use-hosts': useHosts = false,
    'use-system-hosts': useSystemHosts = false,
    'respect-rules': respectRules = false,
    'direct-nameserver-follow-policy': directNameserverFollowPolicy = false,
    'prefer-h3': preferH3 = false,
    'cache-algorithm': cacheAlgorithm = 'lru',
    'default-nameserver': defaultNameserver = ['tls://223.5.5.5'],
    nameserver = ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
    'proxy-server-nameserver': proxyServerNameserver = [],
    'direct-nameserver': directNameserver = [],
    fallback = [],
    'fallback-filter': fallbackFilter = {},
    'fallback-lazy-query': fallbackLazyQuery = false,
    'nameserver-policy': nameserverPolicy = {},
    'proxy-server-nameserver-policy': proxyServerNameserverPolicy = {}
  } = dns || {}
  const [changed, setChanged] = useState(false)
  const { isSaving, runSave } = useSettingsSave()
  const [values, originSetValues] = useState({
    ipv6,
    useHosts,
    enhancedMode,
    fakeIPFilterMode,
    fakeIPRange,
    fakeIPRange6,
    fakeIPFilter,
    useSystemHosts,
    respectRules,
    directNameserverFollowPolicy,
    preferH3,
    cacheAlgorithm,
    defaultNameserver,
    nameserver,
    proxyServerNameserver,
    directNameserver,
    fallback,
    fallbackFilter,
    fallbackLazyQuery,
    nameserverPolicy,
    proxyServerNameserverPolicy,
    hosts: useHosts ? hosts : undefined
  })
  const [fakeIPRangeError, setFakeIPRangeError] = useState<string | null>(() => {
    const r = isValidIPv4Cidr(fakeIPRange)
    return r.ok ? null : (r.error ?? tr('Invalid format'))
  })
  const [fakeIPRange6Error, setFakeIPRange6Error] = useState<string | null>(() => {
    const r = isValidIPv6Cidr(fakeIPRange6)
    return r.ok ? null : (r.error ?? tr('Invalid format'))
  })
  const [fakeIPFilterError, setFakeIPFilterError] = useState<string | null>(() => {
    if (!Array.isArray(fakeIPFilter)) return null
    const firstInvalid = fakeIPFilter.find((f) =>
      fakeIPFilterMode === 'rule' ? !f.trim() : !isValidDomainWildcard(f).ok
    )
    if (!firstInvalid) return null
    return fakeIPFilterMode === 'rule'
      ? tr('Cannot be empty')
      : (isValidDomainWildcard(firstInvalid).error ?? tr('Invalid format'))
  })
  const [defaultNameserverError, setDefaultNameserverError] = useState<string | null>(() => {
    if (!Array.isArray(defaultNameserver)) return null
    const firstInvalid = defaultNameserver.find((f) => !isValidDnsServer(f, true).ok)
    return firstInvalid
      ? (isValidDnsServer(firstInvalid, true).error ?? tr('Invalid format'))
      : null
  })
  const [nameserverError, setNameserverError] = useState<string | null>(() => {
    if (!Array.isArray(nameserver)) return null
    const firstInvalid = nameserver.find((f) => !isValidDnsServer(f).ok)
    return firstInvalid ? (isValidDnsServer(firstInvalid).error ?? tr('Invalid format')) : null
  })
  const [advancedDnsError, setAdvancedDnsError] = useState(false)
  const [draftRevision, setDraftRevision] = useState(0)
  const hasDnsErrors = Boolean(defaultNameserverError || nameserverError || advancedDnsError)
  const hasValidationErrors =
    values.enhancedMode === 'fake-ip'
      ? Boolean(fakeIPRangeError) ||
        (values.ipv6 && Boolean(fakeIPRange6Error)) ||
        Boolean(fakeIPFilterError) ||
        hasDnsErrors
      : hasDnsErrors
  const dnsPresetMode = getDnsPresetMode(values)

  const setValues = (v: typeof values): void => {
    originSetValues(v)
    setChanged(true)
  }

  const selectDnsPreset = (mode: DnsPresetMode): void => {
    setValues(applyDnsPreset(values, mode))
    setFakeIPFilterError(null)
    setDefaultNameserverError(null)
    setNameserverError(null)
    setAdvancedDnsError(false)
    setDraftRevision((value) => value + 1)
  }

  const onSave = async (patch: Partial<MihomoConfig>): Promise<boolean> => {
    const saved = await runSave(async () => {
      await patchAppConfigOrThrow({
        hosts: values.hosts
      })
      await patchControledMihomoConfigOrThrow(patch)
      await restartCore()
    })
    if (saved) setChanged(false)
    return saved
  }

  const saveChanges = (): Promise<boolean> => {
    const hostsObject =
      values.useHosts && values.hosts && values.hosts.length > 0
        ? Object.fromEntries(values.hosts.map(({ domain, value }) => [domain, value]))
        : undefined
    const dnsConfig = {
      ipv6: values.ipv6,
      'fake-ip-range': values.fakeIPRange,
      'fake-ip-range6': values.fakeIPRange6,
      'fake-ip-filter': values.fakeIPFilter,
      'fake-ip-filter-mode': values.fakeIPFilterMode,
      'enhanced-mode': values.enhancedMode,
      'use-hosts': values.useHosts,
      'use-system-hosts': values.useSystemHosts,
      'respect-rules': values.respectRules,
      'direct-nameserver-follow-policy': values.directNameserverFollowPolicy,
      'prefer-h3': values.preferH3,
      'cache-algorithm': values.cacheAlgorithm,
      'default-nameserver': values.defaultNameserver,
      nameserver: values.nameserver,
      'proxy-server-nameserver': values.proxyServerNameserver,
      'direct-nameserver': values.directNameserver,
      fallback: values.fallback,
      'fallback-filter': values.fallbackFilter,
      'fallback-lazy-query': values.fallbackLazyQuery,
      'nameserver-policy': values.nameserverPolicy,
      'proxy-server-nameserver-policy': values.proxyServerNameserverPolicy
    }
    return onSave({ dns: dnsConfig, hosts: hostsObject })
  }

  useUnsavedChangesGuard({
    id: 'dns-settings',
    label: tr('DNS settings'),
    isDirty: changed,
    isSaving,
    canSave: !hasValidationErrors,
    onSave: saveChanges,
    onDiscard: () => {
      originSetValues({
        ipv6,
        useHosts,
        enhancedMode,
        fakeIPFilterMode,
        fakeIPRange,
        fakeIPRange6,
        fakeIPFilter,
        useSystemHosts,
        respectRules,
        directNameserverFollowPolicy,
        preferH3,
        cacheAlgorithm,
        defaultNameserver,
        nameserver,
        proxyServerNameserver,
        directNameserver,
        fallback,
        fallbackFilter,
        fallbackLazyQuery,
        nameserverPolicy,
        proxyServerNameserverPolicy,
        hosts: useHosts ? hosts : undefined
      })
      setFakeIPRangeError(null)
      setFakeIPRange6Error(null)
      setFakeIPFilterError(null)
      setDefaultNameserverError(null)
      setNameserverError(null)
      setAdvancedDnsError(false)
      setDraftRevision((value) => value + 1)
      setChanged(false)
    }
  })

  const saveButton = changed ? (
    <FeatureSettingsSaveButton
      isDirty={changed}
      isSaving={isSaving}
      isDisabled={hasValidationErrors}
      onPress={saveChanges}
    />
  ) : null

  const content = (
    <>
      <FeatureSettingsPanelAction action={embedded ? saveButton : undefined} />
      <FeatureSettingsLayout className="dns-settings" isDirty={changed}>
        <FeatureSettingsSection title={tr('Configuration source')}>
          <SettingItem
            title={tr('Override DNS settings')}
            description={tr(
              'Off uses DNS settings from the subscription; it does not disable DNS. Changing this switch immediately restarts the core.'
            )}
          >
            <Switch
              size="sm"
              isSelected={controlDns}
              isDisabled={isSaving}
              onChange={async (value) => {
                try {
                  await patchAppConfigOrThrow({ controlDns: value })
                  await patchControledMihomoConfigOrThrow({})
                  await restartCore()
                } catch (e) {
                  notify(e, { variant: 'danger' })
                }
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
        </FeatureSettingsSection>
        <fieldset disabled={!controlDns || isSaving} className="min-w-0 border-0 p-0 m-0">
          {!controlDns && (
            <p className="px-4 py-2 text-xs text-muted">
              {tr(
                'Subscription settings are in use. Enable override to edit the application settings below.'
              )}
            </p>
          )}
          <FeatureSettingsSection title={tr('DNS behavior')}>
            <SettingItem title="IPv6" divider>
              <Switch
                size="sm"
                isSelected={values.ipv6}
                onChange={(v) => {
                  setValues({ ...values, ipv6: v })
                }}
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
            <SettingItem
              title={tr('DNS preset')}
              description={tr(
                'Anti-pollution uses regional DNS routing. Overseas uses Cloudflare and Google DNS with DoH/DoT. Save to apply the selected preset.'
              )}
              divider
            >
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-muted">
                  {dnsPresetMode === 'anti-pollution'
                    ? tr('Anti-pollution')
                    : dnsPresetMode === 'overseas'
                      ? tr('Overseas mode')
                      : tr('Custom')}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => selectDnsPreset('anti-pollution')}
                >
                  {tr('Apply anti-pollution preset')}
                </Button>
                <Button size="sm" variant="secondary" onPress={() => selectDnsPreset('overseas')}>
                  {tr('Apply overseas preset')}
                </Button>
              </div>
            </SettingItem>
            <SettingItem
              title={tr('Domain mapping mode')}
              help={tr(
                'Fake IP improves domain-based routing. Real IP resolves normally. Remove mapping disables enhanced mapping.'
              )}
            >
              <KokoSegmentedControl
                ariaLabel={tr('Domain mapping mode')}
                selectedKey={values.enhancedMode}
                options={[
                  { id: 'fake-ip', label: tr('Fake IP') },
                  { id: 'redir-host', label: tr('Real IP') },
                  { id: 'normal', label: tr('Remove mapping') }
                ]}
                onChange={(key) => setValues({ ...values, enhancedMode: key as DnsMode })}
              />
            </SettingItem>
          </FeatureSettingsSection>

          {values.enhancedMode === 'fake-ip' && (
            <FeatureSettingsSection title={tr('Fake IP settings')}>
              <SettingItem title={tr('Fake IP range (IPv4)')} divider>
                <Tooltip delay={0} isOpen={!!fakeIPRangeError}>
                  <Tooltip.Trigger className="inline-flex w-full max-w-72">
                    <KokoTextField
                      controlWidth="full"
                      inputClassName="font-mono"
                      isInvalid={Boolean(fakeIPRangeError)}
                      placeholder={tr('Example: 198.18.0.1/16')}
                      value={values.fakeIPRange}
                      onChangeValue={(v) => {
                        setValues({ ...values, fakeIPRange: v })
                        const r = isValidIPv4Cidr(v)
                        setFakeIPRangeError(r.ok ? null : (r.error ?? tr('Invalid format')))
                      }}
                    />
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    className="bg-danger text-danger-foreground"
                    placement="right"
                    showArrow
                    offset={15}
                  >
                    {fakeIPRangeError}
                  </Tooltip.Content>
                </Tooltip>
              </SettingItem>
              {values.ipv6 && (
                <SettingItem title={tr('Fake IP range (IPv6)')} divider>
                  <Tooltip delay={0} isOpen={!!fakeIPRange6Error}>
                    <Tooltip.Trigger className="inline-flex w-full max-w-72">
                      <KokoTextField
                        controlWidth="full"
                        inputClassName="font-mono"
                        isInvalid={Boolean(fakeIPRange6Error)}
                        placeholder={tr('Example: fc00::/18')}
                        value={values.fakeIPRange6}
                        onChangeValue={(v) => {
                          setValues({ ...values, fakeIPRange6: v })
                          const r = isValidIPv6Cidr(v)
                          setFakeIPRange6Error(r.ok ? null : (r.error ?? tr('Invalid format')))
                        }}
                      />
                    </Tooltip.Trigger>
                    <Tooltip.Content
                      className="bg-danger text-danger-foreground"
                      placement="right"
                      showArrow
                      offset={10}
                    >
                      {fakeIPRange6Error}
                    </Tooltip.Content>
                  </Tooltip>
                </SettingItem>
              )}
              <SettingItem title={tr('Fake-IP filter mode')} divider>
                <KokoSegmentedControl
                  ariaLabel={tr('Fake-IP filter mode')}
                  selectedKey={values.fakeIPFilterMode}
                  options={[
                    { id: 'blacklist', label: tr('Blacklist') },
                    { id: 'whitelist', label: tr('Whitelist') },
                    { id: 'rule', label: tr('Rules') }
                  ]}
                  onChange={(key) => {
                    const fakeIPFilterMode = key as FilterMode
                    setValues({ ...values, fakeIPFilterMode })
                    const firstInvalid = values.fakeIPFilter.find((item) =>
                      fakeIPFilterMode === 'rule' ? !item.trim() : !isValidDomainWildcard(item).ok
                    )
                    setFakeIPFilterError(
                      firstInvalid
                        ? fakeIPFilterMode === 'rule'
                          ? tr('Cannot be empty')
                          : (isValidDomainWildcard(firstInvalid).error ?? tr('Invalid format'))
                        : null
                    )
                  }}
                />
              </SettingItem>
              <EditableList
                title={tr('Fake IP filter')}
                items={values.fakeIPFilter}
                validate={(part) =>
                  values.fakeIPFilterMode === 'rule'
                    ? { ok: Boolean((part as string).trim()) }
                    : isValidDomainWildcard(part as string)
                }
                onChange={(list) => {
                  const arr = list as string[]
                  setValues({ ...values, fakeIPFilter: arr })
                  const firstInvalid = arr.find((f) =>
                    values.fakeIPFilterMode === 'rule' ? !f.trim() : !isValidDomainWildcard(f).ok
                  )
                  setFakeIPFilterError(
                    firstInvalid
                      ? values.fakeIPFilterMode === 'rule'
                        ? tr('Cannot be empty')
                        : (isValidDomainWildcard(firstInvalid).error ?? tr('Invalid format'))
                      : null
                  )
                }}
                placeholder={tr('Example: +.lan')}
                inputClassName="font-mono"
                newItemAppearance="subtle"
                divider={false}
              />
            </FeatureSettingsSection>
          )}

          <FeatureSettingsSection title={tr('DNS servers')}>
            <EditableList
              title={tr('Bootstrap DNS servers')}
              description={tr(
                'Resolves the hostnames of DNS servers, such as a DNS-over-HTTPS endpoint.'
              )}
              items={values.defaultNameserver}
              validate={(part) => isValidDnsServer(part as string, true)}
              onChange={(list) => {
                const arr = list as string[]
                setValues({ ...values, defaultNameserver: arr })
                const firstInvalid = arr.find((f) => !isValidDnsServer(f, true).ok)
                setDefaultNameserverError(
                  firstInvalid
                    ? (isValidDnsServer(firstInvalid, true).error ?? tr('Invalid format'))
                    : null
                )
              }}
              placeholder={tr('Example: 223.5.5.5')}
              inputClassName="font-mono"
              newItemAppearance="subtle"
            />
            <DnsServerList
              title={tr('Default DNS servers')}
              description={tr(
                'Resolves ordinary domain queries unless a domain-specific DNS policy applies.'
              )}
              items={values.nameserver}
              onChange={(arr) => {
                setValues({ ...values, nameserver: arr })
                const firstInvalid = arr.find((f) => !isValidDnsServer(f).ok)
                setNameserverError(
                  firstInvalid
                    ? (isValidDnsServer(firstInvalid).error ?? tr('Invalid format'))
                    : null
                )
              }}
              onErrorChange={setNameserverError}
              placeholder={tr('Example: https://dns.alidns.com/dns-query')}
              divider={false}
              followRoutingRules={values.respectRules}
            />
          </FeatureSettingsSection>
          <AdvancedDnsSetting
            key={draftRevision}
            expandForSetting={advancedSetting}
            respectRules={values.respectRules}
            directNameserverFollowPolicy={values.directNameserverFollowPolicy}
            preferH3={values.preferH3}
            cacheAlgorithm={values.cacheAlgorithm}
            directNameserver={values.directNameserver}
            proxyServerNameserver={values.proxyServerNameserver}
            fallback={values.fallback}
            fallbackFilter={values.fallbackFilter}
            fallbackLazyQuery={values.fallbackLazyQuery}
            nameserverPolicy={values.nameserverPolicy}
            proxyServerNameserverPolicy={values.proxyServerNameserverPolicy}
            hosts={values.hosts}
            useHosts={values.useHosts}
            useSystemHosts={values.useSystemHosts}
            onRespectRulesChange={(v) => {
              setValues({
                ...values,
                respectRules: values.proxyServerNameserver.length === 0 ? false : v
              })
            }}
            onDirectNameserverChange={(arr) => {
              setValues({
                ...values,
                directNameserver: arr,
                directNameserverFollowPolicy:
                  arr.length === 0 ? false : values.directNameserverFollowPolicy
              })
            }}
            onDirectNameserverFollowPolicyChange={(v) =>
              setValues({ ...values, directNameserverFollowPolicy: v })
            }
            onPreferH3Change={(v) => setValues({ ...values, preferH3: v })}
            onCacheAlgorithmChange={(v) => setValues({ ...values, cacheAlgorithm: v })}
            onProxyNameserverChange={(arr) => {
              setValues({
                ...values,
                proxyServerNameserver: arr,
                respectRules: arr.length === 0 ? false : values.respectRules,
                proxyServerNameserverPolicy:
                  arr.length === 0 ? {} : values.proxyServerNameserverPolicy
              })
            }}
            onFallbackChange={(arr) => setValues({ ...values, fallback: arr })}
            onFallbackFilterChange={(filter) => setValues({ ...values, fallbackFilter: filter })}
            onFallbackLazyQueryChange={(v) => setValues({ ...values, fallbackLazyQuery: v })}
            onNameserverPolicyChange={(newValue) => {
              setValues({ ...values, nameserverPolicy: newValue })
            }}
            onProxyServerNameserverPolicyChange={(newValue) => {
              setValues({ ...values, proxyServerNameserverPolicy: newValue })
            }}
            onUseSystemHostsChange={(v) => setValues({ ...values, useSystemHosts: v })}
            onUseHostsChange={(v) => setValues({ ...values, useHosts: v })}
            onHostsChange={(hostArr) => setValues({ ...values, hosts: hostArr })}
            onErrorChange={setAdvancedDnsError}
          />
        </fieldset>
      </FeatureSettingsLayout>
    </>
  )

  if (embedded) return content

  return (
    <BasePage title={tr('DNS settings')} contentClassName="no-scrollbar" header={saveButton}>
      {content}
    </BasePage>
  )
}

export default DNS
