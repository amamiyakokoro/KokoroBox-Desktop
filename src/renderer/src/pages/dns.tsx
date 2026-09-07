import { tr } from '../../../shared/i18n'
import { Button, Tab, Input, Switch, Tabs, Tooltip } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import EditableList from '@renderer/components/base/base-list-editor'
import AdvancedDnsSetting from '@renderer/components/dns/advanced-dns-setting'
import DnsServerList from '@renderer/components/dns/dns-server-list'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { getRuntimeConfig, restartCore } from '@renderer/utils/ipc'
import React, { Key, useState } from 'react'
import { notify } from '@renderer/utils/notification'
import {
  isValidIPv4Cidr,
  isValidIPv6Cidr,
  isValidDomainWildcard,
  isValidDnsServer
} from '@renderer/utils/validate'

const defaultFakeIpFilter = ['+.lan', '+.local', 'time.*.com', 'ntp.*.com', '+.market.xiaomi.com']

const antiPollutionDnsPreset = {
  enhancedMode: 'fake-ip' as DnsMode,
  fakeIPFilterMode: 'blacklist' as FilterMode,
  fakeIPFilter: defaultFakeIpFilter,
  defaultNameserver: ['223.5.5.5', '119.29.29.29'],
  nameserver: ['https://1.1.1.1/dns-query#PROXY', 'https://8.8.8.8/dns-query#PROXY'],
  proxyServerNameserver: ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
  directNameserver: ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
  directNameserverFollowPolicy: true,
  nameserverPolicy: {
    '+.arpa': ['system'],
    'geosite:cn': ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
    'geosite:geolocation-!cn': [
      'https://1.1.1.1/dns-query#PROXY',
      'https://8.8.8.8/dns-query#PROXY'
    ]
  }
}

const DNS: React.FC = () => {
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { hosts } = appConfig || {}
  const { dns } = controledMihomoConfig || {}
  const {
    ipv6 = false,
    'fake-ip-range': fakeIPRange = '198.18.0.1/16',
    'fake-ip-range6': fakeIPRange6 = '',
    'fake-ip-filter': fakeIPFilter = defaultFakeIpFilter,
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
  const [proxyGroups, setProxyGroups] = useState<string[]>([])
  const [fakeIPRangeError, setFakeIPRangeError] = useState<string | null>(() => {
    const r = isValidIPv4Cidr(fakeIPRange)
    return r.ok ? null : (r.error ?? tr('格式错误'))
  })
  const [fakeIPRange6Error, setFakeIPRange6Error] = useState<string | null>(() => {
    const r = isValidIPv6Cidr(fakeIPRange6)
    return r.ok ? null : (r.error ?? tr('格式错误'))
  })
  const [fakeIPFilterError, setFakeIPFilterError] = useState<string | null>(() => {
    if (!Array.isArray(fakeIPFilter)) return null
    const firstInvalid = fakeIPFilter.find((f) =>
      fakeIPFilterMode === 'rule' ? !f.trim() : !isValidDomainWildcard(f).ok
    )
    if (!firstInvalid) return null
    return fakeIPFilterMode === 'rule'
      ? tr('不能为空')
      : (isValidDomainWildcard(firstInvalid).error ?? tr('格式错误'))
  })
  const [defaultNameserverError, setDefaultNameserverError] = useState<string | null>(() => {
    if (!Array.isArray(defaultNameserver)) return null
    const firstInvalid = defaultNameserver.find((f) => !isValidDnsServer(f, true).ok)
    return firstInvalid ? (isValidDnsServer(firstInvalid, true).error ?? tr('格式错误')) : null
  })
  const [nameserverError, setNameserverError] = useState<string | null>(() => {
    if (!Array.isArray(nameserver)) return null
    const firstInvalid = nameserver.find((f) => !isValidDnsServer(f).ok)
    return firstInvalid ? (isValidDnsServer(firstInvalid).error ?? tr('格式错误')) : null
  })
  const [advancedDnsError, setAdvancedDnsError] = useState(false)
  const hasDnsErrors = Boolean(defaultNameserverError || nameserverError || advancedDnsError)
  const isAntiPollutionPreset =
    values.enhancedMode === antiPollutionDnsPreset.enhancedMode &&
    values.fakeIPFilterMode === antiPollutionDnsPreset.fakeIPFilterMode &&
    JSON.stringify(values.defaultNameserver) ===
      JSON.stringify(antiPollutionDnsPreset.defaultNameserver) &&
    JSON.stringify(values.nameserver) === JSON.stringify(antiPollutionDnsPreset.nameserver) &&
    JSON.stringify(values.proxyServerNameserver) ===
      JSON.stringify(antiPollutionDnsPreset.proxyServerNameserver) &&
    JSON.stringify(values.directNameserver) ===
      JSON.stringify(antiPollutionDnsPreset.directNameserver) &&
    values.directNameserverFollowPolicy === antiPollutionDnsPreset.directNameserverFollowPolicy &&
    values.fallback.length === 0 &&
    JSON.stringify(values.nameserverPolicy) ===
      JSON.stringify(antiPollutionDnsPreset.nameserverPolicy)

  React.useEffect(() => {
    void getRuntimeConfig()
      .then((config) => {
        const groups = (config?.['proxy-groups'] || []) as Array<{ name?: string }>
        setProxyGroups(
          groups.map((group) => group.name).filter((name): name is string => Boolean(name))
        )
      })
      .catch(() => setProxyGroups([]))
  }, [])

  const setValues = (v: typeof values): void => {
    originSetValues(v)
    setChanged(true)
  }

  const onSave = async (patch: Partial<MihomoConfig>): Promise<void> => {
    await patchAppConfig({
      hosts: values.hosts
    })
    try {
      setChanged(false)
      await patchControledMihomoConfig(patch)
      await restartCore()
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  return (
    <BasePage
      title={tr('DNS 设置')}
      contentClassName="no-scrollbar"
      header={
        changed && (
          <Button
            size="sm"
            className="app-nodrag"
            color="primary"
            isDisabled={
              values && values.enhancedMode === 'fake-ip'
                ? Boolean(fakeIPRangeError) ||
                  (values.ipv6 && Boolean(fakeIPRange6Error)) ||
                  Boolean(fakeIPFilterError) ||
                  hasDnsErrors
                : hasDnsErrors
            }
            onPress={() => {
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
              onSave({
                dns: dnsConfig,
                hosts: hostsObject
              })
            }}
          >
            {tr('保存')}
          </Button>
        )
      }
    >
      <SettingCard>
        <SettingItem compatKey="legacy" title="IPv6" divider>
          <Switch
            size="sm"
            isSelected={values.ipv6}
            onValueChange={(v) => {
              setValues({ ...values, ipv6: v })
            }}
          />
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('DNS 策略')} divider>
          <Tabs
            size="sm"
            color="primary"
            selectedKey={isAntiPollutionPreset ? 'anti-pollution' : 'custom'}
            onSelectionChange={(key: Key) => {
              if (key !== 'anti-pollution') return
              setValues({
                ...values,
                ...antiPollutionDnsPreset,
                fallback: [],
                fallbackFilter: {},
                fallbackLazyQuery: false,
                respectRules: false
              })
              setFakeIPFilterError(null)
              setDefaultNameserverError(null)
              setNameserverError(null)
            }}
          >
            <Tab key="custom" title={tr('自定义')} />
            <Tab key="anti-pollution" title={tr('抗污染')} />
          </Tabs>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('域名映射模式')} divider>
          <Tabs
            size="sm"
            color="primary"
            selectedKey={values.enhancedMode}
            onSelectionChange={(key: Key) => setValues({ ...values, enhancedMode: key as DnsMode })}
          >
            <Tab key="fake-ip" title={tr('虚假 IP')} />
            <Tab key="redir-host" title={tr('真实 IP')} />
            <Tab key="normal" title={tr('取消映射')} />
          </Tabs>
        </SettingItem>
        {values.enhancedMode === 'fake-ip' && (
          <>
            <SettingItem compatKey="legacy" title={tr('虚假 IP 范围 (IPv4)')} divider>
              <Tooltip
                content={fakeIPRangeError}
                placement="right"
                isOpen={!!fakeIPRangeError}
                showArrow={true}
                color="danger"
                offset={15}
              >
                <Input
                  size="sm"
                  className={
                    `w-[40%] ` +
                    (fakeIPRangeError ? 'border-red-500 ring-1 ring-red-500 rounded-lg' : '')
                  }
                  placeholder={tr('例：198.18.0.1/16')}
                  value={values.fakeIPRange}
                  onValueChange={(v) => {
                    setValues({ ...values, fakeIPRange: v })
                    const r = isValidIPv4Cidr(v)
                    setFakeIPRangeError(r.ok ? null : (r.error ?? tr('格式错误')))
                  }}
                />
              </Tooltip>
            </SettingItem>
            {values.ipv6 && (
              <SettingItem compatKey="legacy" title={tr('虚假 IP 范围 (IPv6)')} divider>
                <Tooltip
                  content={fakeIPRange6Error}
                  placement="right"
                  isOpen={!!fakeIPRange6Error}
                  showArrow={true}
                  color="danger"
                  offset={10}
                >
                  <Input
                    size="sm"
                    className={
                      `w-[40%] ` +
                      (fakeIPRange6Error ? 'border-red-500 ring-1 ring-red-500 rounded-lg' : '')
                    }
                    placeholder={tr('例：fc00::/18')}
                    value={values.fakeIPRange6}
                    onValueChange={(v) => {
                      setValues({ ...values, fakeIPRange6: v })
                      const r = isValidIPv6Cidr(v)
                      setFakeIPRange6Error(r.ok ? null : (r.error ?? tr('格式错误')))
                    }}
                  />
                </Tooltip>
              </SettingItem>
            )}
            <SettingItem compatKey="legacy" title={tr('虚假 IP 过滤模式')} divider>
              <Tabs
                size="sm"
                color="primary"
                selectedKey={values.fakeIPFilterMode}
                onSelectionChange={(key: Key) => {
                  const fakeIPFilterMode = key as FilterMode
                  setValues({ ...values, fakeIPFilterMode })
                  const firstInvalid = values.fakeIPFilter.find((item) =>
                    fakeIPFilterMode === 'rule' ? !item.trim() : !isValidDomainWildcard(item).ok
                  )
                  setFakeIPFilterError(
                    firstInvalid
                      ? fakeIPFilterMode === 'rule'
                        ? tr('不能为空')
                        : (isValidDomainWildcard(firstInvalid).error ?? tr('格式错误'))
                      : null
                  )
                }}
              >
                <Tab key="blacklist" title={tr('黑名单')} />
                <Tab key="whitelist" title={tr('白名单')} />
                <Tab key="rule" title={tr('规则')} />
              </Tabs>
            </SettingItem>
            <EditableList
              title={tr('虚假 IP 过滤器')}
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
                      ? tr('不能为空')
                      : (isValidDomainWildcard(firstInvalid).error ?? tr('格式错误'))
                    : null
                )
              }}
              placeholder={tr('例：+.lan')}
            />
          </>
        )}
        <EditableList
          title={tr('基础服务器')}
          items={values.defaultNameserver}
          validate={(part) => isValidDnsServer(part as string, true)}
          onChange={(list) => {
            const arr = list as string[]
            setValues({ ...values, defaultNameserver: arr })
            const firstInvalid = arr.find((f) => !isValidDnsServer(f, true).ok)
            setDefaultNameserverError(
              firstInvalid ? (isValidDnsServer(firstInvalid, true).error ?? tr('格式错误')) : null
            )
          }}
          placeholder={tr('例：223.5.5.5')}
        />
        <DnsServerList
          title={tr('默认解析服务器')}
          items={values.nameserver}
          proxyGroups={proxyGroups}
          onChange={(arr) => {
            setValues({ ...values, nameserver: arr })
            const firstInvalid = arr.find((f) => !isValidDnsServer(f).ok)
            setNameserverError(
              firstInvalid ? (isValidDnsServer(firstInvalid).error ?? tr('格式错误')) : null
            )
          }}
          onErrorChange={setNameserverError}
          placeholder={tr('例：https://dns.alidns.com/dns-query')}
          divider={false}
        />
      </SettingCard>
      <AdvancedDnsSetting
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
        proxyGroups={proxyGroups}
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
            proxyServerNameserverPolicy: arr.length === 0 ? {} : values.proxyServerNameserverPolicy
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
    </BasePage>
  )
}

export default DNS
