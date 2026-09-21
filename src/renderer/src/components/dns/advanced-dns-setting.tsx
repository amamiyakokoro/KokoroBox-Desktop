import { tr } from '../../../../shared/i18n'
import React, { useState } from 'react'
import { Disclosure, Switch } from '@heroui/react'
import SettingItem from '../base/base-setting-item'
import EditableList from '../base/base-list-editor'
import { FeatureSettingsSection } from '../base/base-feature-settings'
import { KokoSelect, KokoTextField } from '../base/koko-form'
import { isValidDnsServer, isValidDomainWildcard } from '@renderer/utils/validate'
import DnsServerList from './dns-server-list'

interface AdvancedDnsSettingProps {
  expandForSetting?: string | null
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
  expandForSetting,
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
  const [isExpanded, setIsExpanded] = useState(Boolean(expandForSetting))
  const [directNameserverError, setDirectNameserverError] = useState<string | null>(null)
  const [proxyNameserverError, setProxyNameserverError] = useState<string | null>(null)
  const [fallbackError, setFallbackError] = useState<string | null>(null)
  const [nameserverPolicyError, setNameserverPolicyError] = useState<string | null>(null)
  const [proxyNameserverPolicyError, setProxyNameserverPolicyError] = useState<string | null>(null)
  const [hostsError, setHostsError] = useState<string | null>(null)

  React.useEffect(() => {
    if (expandForSetting) setIsExpanded(true)
  }, [expandForSetting])

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

  const content = (
    <>
      <FeatureSettingsSection title={tr('DNS routing')}>
        <SettingItem title={tr('Follow routing rules for connections')} divider>
          <Switch
            size="sm"
            isSelected={respectRules}
            isDisabled={proxyServerNameserver.length === 0}
            onChange={onRespectRulesChange}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <DnsServerList
          title={tr('Direct-connection DNS servers')}
          items={directNameserver}
          onChange={onDirectNameserverChange}
          onErrorChange={setDirectNameserverError}
          placeholder={tr('Example: tls://dns.alidns.com')}
          followRoutingRules={respectRules}
        />
        <SettingItem
          title={tr('Apply domain DNS policy to direct DNS')}
          help={tr(
            'When enabled, direct traffic still checks the domain DNS policy before using Direct DNS. When disabled, it always uses Direct DNS.'
          )}
          divider
        >
          <Switch
            size="sm"
            isSelected={directNameserverFollowPolicy}
            isDisabled={directNameserver.length === 0}
            onChange={onDirectNameserverFollowPolicyChange}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <DnsServerList
          title={tr('Proxy DNS servers')}
          items={proxyServerNameserver}
          onChange={onProxyNameserverChange}
          onErrorChange={setProxyNameserverError}
          placeholder={tr('Example: tls://dns.alidns.com')}
          followRoutingRules={respectRules}
        />
        {proxyServerNameserver.length > 0 && (
          <EditableList
            title={tr('Proxy DNS policy')}
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
                      isValidDomainWildcard(domain).error ?? tr('Invalid domain format')
                    )
                    return
                  }
                }
                for (const v of Object.values(rec)) {
                  if (Array.isArray(v)) {
                    for (const vv of v) {
                      if (!isValidDnsServer(vv).ok) {
                        setProxyNameserverPolicyError(
                          isValidDnsServer(vv).error ?? tr('Invalid format')
                        )
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
                        setProxyNameserverPolicyError(
                          isValidDnsServer(p).error ?? tr('Invalid format')
                        )
                        return
                      }
                    }
                  }
                }
                setProxyNameserverPolicyError(null)
              } catch (e) {
                setProxyNameserverPolicyError(tr('Invalid policy format'))
              }
            }}
            placeholder={tr('Domain')}
            part2Placeholder={tr('DNS servers, separated by commas')}
            part1Label={tr('Domain or rule')}
            part2Label={tr('DNS servers')}
            inputClassName="font-mono"
            layout="key-value"
            objectMode="record"
          />
        )}
        <EditableList
          title={tr('Domain resolution policy')}
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
                  setNameserverPolicyError(
                    isValidDomainWildcard(domain).error ?? tr('Invalid domain format')
                  )
                  return
                }
              }
              for (const v of Object.values(rec)) {
                if (Array.isArray(v)) {
                  for (const vv of v) {
                    if (!isValidDnsServer(vv).ok) {
                      setNameserverPolicyError(isValidDnsServer(vv).error ?? tr('Invalid format'))
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
                      setNameserverPolicyError(isValidDnsServer(p).error ?? tr('Invalid format'))
                      return
                    }
                  }
                }
              }
              setNameserverPolicyError(null)
            } catch (e) {
              setNameserverPolicyError(tr('Invalid policy format'))
            }
          }}
          placeholder={tr('Domain')}
          part2Placeholder={tr('DNS servers, separated by commas')}
          part1Label={tr('Domain or rule')}
          part2Label={tr('DNS servers')}
          inputClassName="font-mono"
          layout="key-value"
          objectMode="record"
        />
        <DnsServerList
          title={tr('Fallback DNS servers')}
          items={fallback}
          onChange={onFallbackChange}
          onErrorChange={setFallbackError}
          placeholder={tr('Example: tls://1.1.1.1')}
          followRoutingRules={respectRules}
          divider={false}
        />
      </FeatureSettingsSection>

      <FeatureSettingsSection title={tr('Advanced options')}>
        {fallback.length > 0 && (
          <>
            <SettingItem title={tr('Fallback GeoIP filter')} divider>
              <Switch
                size="sm"
                isSelected={fallbackFilter.geoip !== false}
                onChange={(geoip) => onFallbackFilterChange({ ...fallbackFilter, geoip })}
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
            <SettingItem title={tr('Fallback GeoIP country')} divider>
              <KokoTextField
                aria-label={tr('Fallback GeoIP country')}
                controlWidth="short"
                value={String(fallbackFilter['geoip-code'] || 'CN')}
                onChangeValue={(code) =>
                  onFallbackFilterChange({ ...fallbackFilter, 'geoip-code': code.toUpperCase() })
                }
              />
            </SettingItem>
            <SettingItem title={tr('Query fallback DNS lazily')} divider>
              <Switch size="sm" isSelected={fallbackLazyQuery} onChange={onFallbackLazyQueryChange}>
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
          </>
        )}
        <SettingItem title={tr('Prefer HTTP/3')} divider>
          <Switch size="sm" isSelected={preferH3} onChange={onPreferH3Change}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <SettingItem title={tr('DNS cache algorithm')} divider>
          <KokoSelect
            aria-label={tr('DNS cache algorithm')}
            controlWidth="select"
            density="compact"
            variant="secondary"
            value={cacheAlgorithm}
            options={[
              { id: 'lru', label: 'LRU' },
              { id: 'arc', label: 'ARC' }
            ]}
            disallowEmptySelection
            onChange={onCacheAlgorithmChange}
          />
        </SettingItem>
        <SettingItem title={tr('Use system hosts')} divider>
          <Switch size="sm" isSelected={useSystemHosts} onChange={onUseSystemHostsChange}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <SettingItem title={tr('Custom hosts')}>
          <Switch size="sm" isSelected={useHosts} onChange={onUseHostsChange}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
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
                  setHostsError(isValidDomainWildcard(domain).error ?? tr('Invalid domain format'))
                  return
                }
              }
              setHostsError(null)
            }}
            placeholder={tr('Domain')}
            part2Placeholder={tr('Domains or IP addresses, separated by commas')}
            part1Label={tr('Domain')}
            part2Label={tr('Address or value')}
            inputClassName="font-mono"
            layout="key-value"
            objectMode="record"
            divider={false}
          />
        )}
      </FeatureSettingsSection>
    </>
  )

  return (
    <Disclosure
      className="mx-3 my-1.5 overflow-hidden rounded-xl border border-separator/70 bg-surface"
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <Disclosure.Heading>
        <Disclosure.Trigger
          className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-base font-semibold text-foreground"
          data-setting-label={tr('Advanced DNS settings')}
        >
          <span className="min-w-0 flex-1">{tr('Advanced DNS settings')}</span>
          <Disclosure.Indicator className="text-muted" />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div className="border-t border-separator">{content}</div>
      </Disclosure.Content>
    </Disclosure>
  )
}

export default AdvancedDnsSetting
