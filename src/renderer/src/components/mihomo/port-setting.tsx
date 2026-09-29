import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState } from 'react'
import { Button, Switch } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import EditableList from '../base/base-list-editor'
import SettingsAdvancedSection from '../base/base-settings-advanced-section'

import { platform } from '@renderer/utils/init'
import { KokoTextField } from '../base/koko-form'
import { FaNetworkWired } from 'react-icons/fa'
import InterfaceModal from '@renderer/components/mihomo/interface-modal'

const emptyStringList: string[] = []
const defaultSkipAuthPrefixes = ['127.0.0.1/32']

interface PortSettingProps {
  config: Partial<MihomoConfig>
  onChange: (patch: Partial<MihomoConfig>) => void
  onValidationChange: (key: string, invalid: boolean) => void
}

const PortSetting: React.FC<PortSettingProps> = ({ config, onChange, onValidationChange }) => {
  const {
    ipv6,
    authentication = emptyStringList,
    'skip-auth-prefixes': skipAuthPrefixes = defaultSkipAuthPrefixes,
    'allow-lan': allowLan,
    'lan-allowed-ips': lanAllowedIps = emptyStringList,
    'lan-disallowed-ips': lanDisallowedIps = emptyStringList,
    'mixed-port': mixedPort = 7890,
    'socks-port': socksPort = 0,
    port: httpPort = 0,
    'redir-port': redirPort = 0,
    'tproxy-port': tproxyPort = 0
  } = config

  const [mixedPortInput, setMixedPortInput] = useState(mixedPort)
  const [socksPortInput, setSocksPortInput] = useState(socksPort)
  const [httpPortInput, setHttpPortInput] = useState(httpPort)
  const [redirPortInput, setRedirPortInput] = useState(redirPort)
  const [tproxyPortInput, setTproxyPortInput] = useState(tproxyPort)
  const [lanAllowedIpsInput, setLanAllowedIpsInput] = useState(lanAllowedIps)
  const [lanDisallowedIpsInput, setLanDisallowedIpsInput] = useState(lanDisallowedIps)
  const [authenticationInput, setAuthenticationInput] = useState(authentication)
  const [skipAuthPrefixesInput, setSkipAuthPrefixesInput] = useState(skipAuthPrefixes)
  const [lanOpen, setLanOpen] = useState(false)

  useEffect(() => setMixedPortInput(mixedPort), [mixedPort])
  useEffect(() => setSocksPortInput(socksPort), [socksPort])
  useEffect(() => setHttpPortInput(httpPort), [httpPort])
  useEffect(() => setRedirPortInput(redirPort), [redirPort])
  useEffect(() => setTproxyPortInput(tproxyPort), [tproxyPort])
  useEffect(() => setLanAllowedIpsInput(lanAllowedIps), [lanAllowedIps])
  useEffect(() => setLanDisallowedIpsInput(lanDisallowedIps), [lanDisallowedIps])
  useEffect(() => setAuthenticationInput(authentication), [authentication])
  useEffect(() => setSkipAuthPrefixesInput(skipAuthPrefixes), [skipAuthPrefixes])

  const parseAuth = (item: string): { part1: string; part2: string } => {
    const [user = '', pass = ''] = item.split(':')
    return { part1: user, part2: pass }
  }
  const formatAuth = (user: string, pass?: string): string => `${user}:${pass || ''}`
  const hasPortConflict = (): boolean => {
    const ports = [
      mixedPortInput,
      socksPortInput,
      httpPortInput,
      redirPortInput,
      tproxyPortInput
    ].filter((p) => p !== 0)
    return new Set(ports).size !== ports.length
  }

  const ports = [mixedPortInput, socksPortInput, httpPortInput, redirPortInput, tproxyPortInput]
  const portConflict = hasPortConflict()
  const invalidPort = ports.some((port) => port < 0 || port > 65535)
  const hasPortError = portConflict || invalidPort

  useEffect(() => {
    onValidationChange('ports', hasPortError)
    return () => onValidationChange('ports', false)
  }, [hasPortError, onValidationChange])

  return (
    <>
      {lanOpen && <InterfaceModal onClose={() => setLanOpen(false)} />}
      <SettingCard header={tr('Network and ports')}>
        <p className="py-2 text-xs leading-5 text-muted">
          {tr('Proxy listener ports. Set a port to 0 to disable that listener.')}
        </p>
        <SettingItem title="IPv6" divider>
          <Switch isSelected={ipv6} size="sm" onChange={(value) => onChange({ ipv6: value })}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <SettingItem
          title={tr('Mixed port')}
          description={tr('Accepts both HTTP and SOCKS proxy connections on one port.')}
          divider
        >
          <KokoTextField
            type="number"
            controlWidth="number"
            value={mixedPortInput.toString()}
            max={65535}
            min={0}
            isInvalid={hasPortError}
            onChangeValue={(v) => {
              const value = parseInt(v) || 0
              setMixedPortInput(value)
              onChange({ 'mixed-port': value })
            }}
          />
        </SettingItem>
        {hasPortError && (
          <p role="alert" className="py-2 text-xs text-danger">
            {portConflict
              ? tr('Enabled proxy ports must be different.')
              : tr('Ports must be between 0 and 65535.')}
          </p>
        )}
        <SettingsAdvancedSection
          title={tr('Additional proxy listeners')}
          settingIds={[
            'mihomo-socks-port',
            'mihomo-http-port',
            'mihomo-redir-port',
            'mihomo-tproxy-port'
          ]}
        >
          <SettingItem title={tr('SOCKS port')} divider>
            <KokoTextField
              type="number"
              controlWidth="number"
              value={socksPortInput.toString()}
              max={65535}
              min={0}
              isInvalid={hasPortError}
              onChangeValue={(v) => {
                const value = parseInt(v) || 0
                setSocksPortInput(value)
                onChange({ 'socks-port': value })
              }}
            />
          </SettingItem>
          <SettingItem title={tr('HTTP port')} divider>
            <KokoTextField
              type="number"
              controlWidth="number"
              value={httpPortInput.toString()}
              max={65535}
              min={0}
              isInvalid={hasPortError}
              onChangeValue={(v) => {
                const value = parseInt(v) || 0
                setHttpPortInput(value)
                onChange({ port: value })
              }}
            />
          </SettingItem>
          {platform !== 'win32' && (
            <SettingItem title={tr('Redir port')} divider>
              <KokoTextField
                type="number"
                controlWidth="number"
                value={redirPortInput.toString()}
                max={65535}
                min={0}
                isInvalid={hasPortError}
                onChangeValue={(v) => {
                  const value = parseInt(v) || 0
                  setRedirPortInput(value)
                  onChange({ 'redir-port': value })
                }}
              />
            </SettingItem>
          )}
          {platform === 'linux' && (
            <SettingItem title={tr('TProxy port')} divider>
              <KokoTextField
                type="number"
                controlWidth="number"
                value={tproxyPortInput.toString()}
                max={65535}
                min={0}
                isInvalid={hasPortError}
                onChangeValue={(v) => {
                  const value = parseInt(v) || 0
                  setTproxyPortInput(value)
                  onChange({ 'tproxy-port': value })
                }}
              />
            </SettingItem>
          )}
        </SettingsAdvancedSection>
      </SettingCard>
      <SettingCard header={tr('LAN access and authentication')}>
        <SettingItem
          title={tr('Allow LAN connections')}
          description={tr(
            'Other devices connect to this computer’s LAN address and proxy port. The firewall must permit inbound connections.'
          )}
          actions={
            <Button
              size="sm"
              isIconOnly
              aria-label={tr('Network interfaces')}
              variant="ghost"
              onPress={() => {
                setLanOpen(true)
              }}
            >
              <FaNetworkWired className="text-lg" />
            </Button>
          }
          divider
        >
          <Switch
            size="sm"
            isSelected={allowLan}
            onChange={(v) => {
              onChange({ 'allow-lan': v })
            }}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        {allowLan && (
          <>
            <SettingItem
              title={tr('Allowed IP ranges')}
              description={tr('Client address ranges in CIDR format, for example 192.168.1.0/24.')}
            />
            <EditableList
              items={lanAllowedIpsInput}
              onChange={(items) => {
                const value = items as string[]
                setLanAllowedIpsInput(value)
                onChange({ 'lan-allowed-ips': value })
              }}
              placeholder={tr('IP range')}
            />
            <SettingItem
              title={tr('Blocked IP ranges')}
              description={tr(
                'Blocks matching proxy clients. A blocked range takes precedence over an allowed range.'
              )}
            />
            <EditableList
              items={lanDisallowedIpsInput}
              onChange={(items) => {
                const value = items as string[]
                setLanDisallowedIpsInput(value)
                onChange({ 'lan-disallowed-ips': value })
              }}
              placeholder={tr('IP range')}
            />
          </>
        )}
        <SettingItem
          title={tr('User authentication')}
          description={tr(
            'Credentials for HTTP and SOCKS proxy clients, separate from the controller access key.'
          )}
        />
        <EditableList
          items={authenticationInput}
          onChange={(items) => {
            const value = items as string[]
            setAuthenticationInput(value)
            onChange({ authentication: value })
          }}
          placeholder={tr('Username')}
          part2Placeholder={tr('Password')}
          parse={parseAuth}
          format={formatAuth}
        />
        <SettingItem
          title={tr('IP ranges exempt from authentication')}
          description={tr(
            'Proxy clients in these ranges do not need the username and password above.'
          )}
        />
        <EditableList
          items={skipAuthPrefixesInput}
          onChange={(items) => {
            const value = items as string[]
            setSkipAuthPrefixesInput(value)
            onChange({ 'skip-auth-prefixes': value })
          }}
          placeholder={tr('IP range')}
          disableFirst
          divider={false}
        />
      </SettingCard>
    </>
  )
}

export default PortSetting
