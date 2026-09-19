import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState } from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import EditableList from '../base/base-list-editor'

import { platform } from '@renderer/utils/init'
import {
  KokoButton as Button,
  KokoSwitch as Switch,
  KokoTextField as Input
} from '../base/koko-form'
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
      <SettingCard header={tr('Port settings')}>
        <SettingItem title={tr('Mixed port')} divider>
          <Input
            size="sm"
            type="number"
            className="w-25"
            value={mixedPortInput.toString()}
            max={65535}
            min={0}
            isInvalid={hasPortError}
            onValueChange={(v) => {
              const value = parseInt(v) || 0
              setMixedPortInput(value)
              onChange({ 'mixed-port': value })
            }}
          />
        </SettingItem>
        <SettingItem title={tr('SOCKS port')} divider>
          <Input
            size="sm"
            type="number"
            className="w-25"
            value={socksPortInput.toString()}
            max={65535}
            min={0}
            isInvalid={hasPortError}
            onValueChange={(v) => {
              const value = parseInt(v) || 0
              setSocksPortInput(value)
              onChange({ 'socks-port': value })
            }}
          />
        </SettingItem>
        <SettingItem title={tr('HTTP port')} divider>
          <Input
            size="sm"
            type="number"
            className="w-25"
            value={httpPortInput.toString()}
            max={65535}
            min={0}
            isInvalid={hasPortError}
            onValueChange={(v) => {
              const value = parseInt(v) || 0
              setHttpPortInput(value)
              onChange({ port: value })
            }}
          />
        </SettingItem>
        {platform !== 'win32' && (
          <SettingItem title={tr('Redir port')} divider>
            <Input
              size="sm"
              type="number"
              className="w-25"
              value={redirPortInput.toString()}
              max={65535}
              min={0}
              isInvalid={hasPortError}
              onValueChange={(v) => {
                const value = parseInt(v) || 0
                setRedirPortInput(value)
                onChange({ 'redir-port': value })
              }}
            />
          </SettingItem>
        )}
        {platform === 'linux' && (
          <SettingItem title={tr('TProxy port')} divider>
            <Input
              size="sm"
              type="number"
              className="w-25"
              value={tproxyPortInput.toString()}
              max={65535}
              min={0}
              isInvalid={hasPortError}
              onValueChange={(v) => {
                const value = parseInt(v) || 0
                setTproxyPortInput(value)
                onChange({ 'tproxy-port': value })
              }}
            />
          </SettingItem>
        )}
        <SettingItem
          title={tr('Allow LAN connections')}
          actions={
            <Button
              size="sm"
              isIconOnly
              variant="light"
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
            onValueChange={(v) => {
              onChange({ 'allow-lan': v })
            }}
          />
        </SettingItem>
        {allowLan && (
          <>
            <SettingItem title={tr('Allowed IP ranges')} />
            <EditableList
              items={lanAllowedIpsInput}
              onChange={(items) => {
                const value = items as string[]
                setLanAllowedIpsInput(value)
                onChange({ 'lan-allowed-ips': value })
              }}
              placeholder={tr('IP range')}
            />
            <SettingItem title={tr('Blocked IP ranges')} />
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
        <SettingItem title={tr('User authentication')} />
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
        <SettingItem title={tr('IP ranges exempt from authentication')} />
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
