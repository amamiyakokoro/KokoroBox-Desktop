import { tr } from '../../../../shared/i18n'
import React, { useState } from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import EditableList from '../base/base-list-editor'
import { Input, Select, SelectItem, Switch, Tooltip } from '@heroui/react'
import { MdHelpOutline } from 'react-icons/md'
import { isValidDnsServer, isValidDomainWildcard } from '@renderer/utils/validate'
import DnsServerList from './dns-server-list'

interface AdvancedDnsSettingProps {
  respectRules: boolean
  directNameserverFollowPolicy: boolean
  preferH3: boolean
  cacheAlgorithm: string
  directNameserver: string[]
  proxyServerNameserver: string[]
  fallback: string[]
  fallbackFilter: Record<string, boolean | string | string[]>
  fallbackLazyQuery: boolean
  nameserverPolicy: Record<string, string | string[]>
  proxyServerNameserverPolicy: Record<string, string | string[]>
  hosts?: IHost[]
  useHosts: boolean
  useSystemHosts: boolean
  onRespectRulesChange: (v: boolean) => void
  onDirectNameserverFollowPolicyChange: (v: boolean) => void
  onPreferH3Change: (v: boolean) => void
  onCacheAlgorithmChange: (v: string) => void
  onDirectNameserverChange: (list: string[]) => void
  onProxyNameserverChange: (list: string[]) => void
  onFallbackChange: (list: string[]) => void
  onFallbackFilterChange: (filter: Record<string, boolean | string | string[]>) => void
  onFallbackLazyQueryChange: (v: boolean) => void
  onNameserverPolicyChange: (policy: Record<string, string | string[]>) => void
  onProxyServerNameserverPolicyChange: (policy: Record<string, string | string[]>) => void
  onUseSystemHostsChange: (v: boolean) => void
  onUseHostsChange: (v: boolean) => void
  onHostsChange: (hosts: IHost[]) => void
  onErrorChange?: (hasError: boolean) => void
}

const AdvancedDnsSetting: React.FC<AdvancedDnsSettingProps> = ({
  respectRules,
  directNameserverFollowPolicy,
  preferH3,
  cacheAlgorithm,
  directNameserver,
  proxyServerNameserver,
  fallback,
  fallbackFilter,
  fallbackLazyQuery,
  nameserverPolicy,
  proxyServerNameserverPolicy,
  hosts,
  useHosts,
  useSystemHosts,
  onRespectRulesChange,
  onDirectNameserverFollowPolicyChange,
  onPreferH3Change,
  onCacheAlgorithmChange,
  onDirectNameserverChange,
  onProxyNameserverChange,
  onFallbackChange,
  onFallbackFilterChange,
  onFallbackLazyQueryChange,
  onNameserverPolicyChange,
  onProxyServerNameserverPolicyChange,
  onUseSystemHostsChange,
  onUseHostsChange,
  onHostsChange,
  onErrorChange
}) => {
  const [directNameserverError, setDirectNameserverError] = useState<string | null>(null)
  const [proxyNameserverError, setProxyNameserverError] = useState<string | null>(null)
  const [fallbackError, setFallbackError] = useState<string | null>(null)
  const [nameserverPolicyError, setNameserverPolicyError] = useState<string | null>(null)
  const [proxyNameserverPolicyError, setProxyNameserverPolicyError] = useState<string | null>(null)
  const [hostsError, setHostsError] = useState<string | null>(null)

  React.useEffect(() => {
    const hasError = Boolean(
      directNameserverError ||
      proxyNameserverError ||
      fallbackError ||
      nameserverPolicyError ||
      proxyNameserverPolicyError ||
      hostsError
    )
    onErrorChange?.(hasError)
  }, [
    directNameserverError,
    proxyNameserverError,
    fallbackError,
    nameserverPolicyError,
    proxyNameserverPolicyError,
    hostsError,
    onErrorChange
  ])

  return (
    <SettingCard header={tr('更多设置')}>
      <SettingItem compatKey="legacy" title={tr('连接遵守规则')} divider>
        <Switch
          size="sm"
          isSelected={respectRules}
          isDisabled={proxyServerNameserver.length === 0}
          onValueChange={onRespectRulesChange}
        />
      </SettingItem>
      <DnsServerList
        title={tr('直连解析服务器')}
        items={directNameserver}
        onChange={onDirectNameserverChange}
        onErrorChange={setDirectNameserverError}
        placeholder={tr('例：tls://dns.alidns.com')}
        followRoutingRules={respectRules}
      />
      <SettingItem
        compatKey="legacy"
        title={tr('直连 DNS 套用网域策略')}
        actions={
          <Tooltip content={tr('启用后，直连流量使用直连 DNS 时，仍会优先套用网域解析策略；关闭则一律使用直连 DNS。')}>
            <span className="ml-1 inline-flex cursor-help text-foreground-400" aria-label={tr('说明')}>
              <MdHelpOutline />
            </span>
          </Tooltip>
        }
        divider
      >
        <Switch
          size="sm"
          isSelected={directNameserverFollowPolicy}
          isDisabled={directNameserver.length === 0}
          onValueChange={onDirectNameserverFollowPolicyChange}
        />
      </SettingItem>
      <DnsServerList
        title={tr('代理节点解析服务器')}
        items={proxyServerNameserver}
        onChange={onProxyNameserverChange}
        onErrorChange={setProxyNameserverError}
        placeholder={tr('例：tls://dns.alidns.com')}
        followRoutingRules={respectRules}
      />
      {proxyServerNameserver.length > 0 && (
        <EditableList
          title={tr('代理节点解析策略')}
          items={proxyServerNameserverPolicy}
          validate={(part1) => isValidDomainWildcard(part1)}
          validatePart2={(part2) => {
            const parts = part2
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
            for (const p of parts) {
              const result = isValidDnsServer(p)
              if (!result.ok) {
                return result
              }
            }
            return { ok: true }
          }}
          onChange={(newValue) => {
            onProxyServerNameserverPolicyChange(newValue as Record<string, string | string[]>)
            try {
              const rec = newValue as Record<string, string | string[]>
              for (const domain of Object.keys(rec)) {
                if (!isValidDomainWildcard(domain).ok) {
                  setProxyNameserverPolicyError(
                    isValidDomainWildcard(domain).error ?? tr('域名格式错误')
                  )
                  return
                }
              }
              for (const v of Object.values(rec)) {
                if (Array.isArray(v)) {
                  for (const vv of v) {
                    if (!isValidDnsServer(vv).ok) {
                      setProxyNameserverPolicyError(isValidDnsServer(vv).error ?? tr('格式错误'))
                      return
                    }
                  }
                } else {
                  const parts = (v as string)
                    .split(',')
                    .map((p) => p.trim())
                    .filter(Boolean)
                  for (const p of parts) {
                    if (!isValidDnsServer(p).ok) {
                      setProxyNameserverPolicyError(isValidDnsServer(p).error ?? tr('格式错误'))
                      return
                    }
                  }
                }
              }
              setProxyNameserverPolicyError(null)
            } catch (e) {
              setProxyNameserverPolicyError(tr('策略格式错误'))
            }
          }}
          placeholder={tr('域名')}
          part2Placeholder={tr('DNS 服务器，用逗号分隔')}
          objectMode="record"
        />
      )}
      <EditableList
        title={tr('域名解析策略')}
        items={nameserverPolicy}
        validatePart1={(part1) => isValidDomainWildcard(part1)}
        validatePart2={(part2) => {
          const parts = part2
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
          for (const p of parts) {
            const result = isValidDnsServer(p)
            if (!result.ok) {
              return result
            }
          }
          return { ok: true }
        }}
        onChange={(newValue) => {
          onNameserverPolicyChange(newValue as Record<string, string | string[]>)
          try {
            const rec = newValue as Record<string, string | string[]>
            for (const domain of Object.keys(rec)) {
              if (!isValidDomainWildcard(domain).ok) {
                setNameserverPolicyError(isValidDomainWildcard(domain).error ?? tr('域名格式错误'))
                return
              }
            }
            for (const v of Object.values(rec)) {
              if (Array.isArray(v)) {
                for (const vv of v) {
                  if (!isValidDnsServer(vv).ok) {
                    setNameserverPolicyError(isValidDnsServer(vv).error ?? tr('格式错误'))
                    return
                  }
                }
              } else {
                const parts = (v as string)
                  .split(',')
                  .map((p) => p.trim())
                  .filter(Boolean)
                for (const p of parts) {
                  if (!isValidDnsServer(p).ok) {
                    setNameserverPolicyError(isValidDnsServer(p).error ?? tr('格式错误'))
                    return
                  }
                }
              }
            }
            setNameserverPolicyError(null)
          } catch (e) {
            setNameserverPolicyError(tr('策略格式错误'))
          }
        }}
        placeholder={tr('域名')}
        part2Placeholder={tr('DNS 服务器，用逗号分隔')}
        objectMode="record"
      />
      <DnsServerList
        title={tr('备用解析服务器')}
        items={fallback}
        onChange={onFallbackChange}
        onErrorChange={setFallbackError}
        placeholder={tr('例：tls://1.1.1.1')}
        followRoutingRules={respectRules}
      />
      {fallback.length > 0 && (
        <>
          <SettingItem compatKey="legacy" title={tr('Fallback GeoIP 过滤')} divider>
            <Switch
              size="sm"
              isSelected={fallbackFilter.geoip !== false}
              onValueChange={(geoip) => onFallbackFilterChange({ ...fallbackFilter, geoip })}
            />
          </SettingItem>
          <SettingItem compatKey="legacy" title={tr('Fallback GeoIP 国家')} divider>
            <Input
              aria-label={tr('Fallback GeoIP 国家')}
              size="sm"
              className="w-32"
              value={String(fallbackFilter['geoip-code'] || 'CN')}
              onValueChange={(code) =>
                onFallbackFilterChange({ ...fallbackFilter, 'geoip-code': code.toUpperCase() })
              }
            />
          </SettingItem>
          <SettingItem compatKey="legacy" title={tr('延迟查询备用 DNS')} divider>
            <Switch
              size="sm"
              isSelected={fallbackLazyQuery}
              onValueChange={onFallbackLazyQueryChange}
            />
          </SettingItem>
        </>
      )}
      <SettingItem compatKey="legacy" title={tr('优先使用 HTTP/3')} divider>
        <Switch size="sm" isSelected={preferH3} onValueChange={onPreferH3Change} />
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('DNS 缓存算法')} divider>
        <Select
          aria-label={tr('DNS 缓存算法')}
          className="w-28"
          size="sm"
          selectedKeys={new Set([cacheAlgorithm])}
          disallowEmptySelection
          onSelectionChange={(keys) => onCacheAlgorithmChange(keys.currentKey as string)}
        >
          <SelectItem key="lru">LRU</SelectItem>
          <SelectItem key="arc">ARC</SelectItem>
        </Select>
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('使用系统 Hosts')} divider>
        <Switch size="sm" isSelected={useSystemHosts} onValueChange={onUseSystemHostsChange} />
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('自定义 Hosts')}>
        <Switch size="sm" isSelected={useHosts} onValueChange={onUseHostsChange} />
      </SettingItem>
      {useHosts && (
        <EditableList
          items={hosts ? Object.fromEntries(hosts.map((h) => [h.domain, h.value])) : {}}
          validatePart1={(part1) => isValidDomainWildcard(part1)}
          onChange={(rec) => {
            const hostArr: IHost[] = Object.entries(rec as Record<string, string | string[]>).map(
              ([domain, value]) => ({
                domain,
                value: value as string | string[]
              })
            )
            onHostsChange(hostArr)
            for (const domain of Object.keys(rec as Record<string, string | string[]>)) {
              if (!isValidDomainWildcard(domain).ok) {
                setHostsError(isValidDomainWildcard(domain).error ?? tr('域名格式错误'))
                return
              }
            }
            setHostsError(null)
          }}
          placeholder={tr('域名')}
          part2Placeholder={tr('域名或 IP，用逗号分隔多个值')}
          objectMode="record"
          divider={false}
        />
      )}
    </SettingCard>
  )
}

export default AdvancedDnsSetting
