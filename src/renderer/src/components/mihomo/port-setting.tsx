import { tr } from '../../../../shared/i18n'
import React, { useState } from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import EditableList from '../base/base-list-editor'

import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { restartCore, triggerSysProxy } from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import { Button, Input, Switch } from '@heroui/react'
import { FaNetworkWired } from 'react-icons/fa'
import InterfaceModal from '@renderer/components/mihomo/interface-modal'

const PortSetting: React.FC = () => {
  const { appConfig } = useAppConfig()
  const { sysProxy, onlyActiveDevice = false } = appConfig || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const {
    authentication = [],
    'skip-auth-prefixes': skipAuthPrefixes = ['127.0.0.1/32'],
    'allow-lan': allowLan,
    'lan-allowed-ips': lanAllowedIps = [],
    'lan-disallowed-ips': lanDisallowedIps = [],
    'mixed-port': mixedPort = 7890,
    'socks-port': socksPort = 0,
    port: httpPort = 0,
    'redir-port': redirPort = 0,
    'tproxy-port': tproxyPort = 0
  } = controledMihomoConfig || {}

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

  const onChangeNeedRestart = async (patch: Partial<MihomoConfig>): Promise<void> => {
    await patchControledMihomoConfig(patch)
    await restartCore()
  }

  return (
    <>
      {lanOpen && <InterfaceModal onClose={() => setLanOpen(false)} />}
      <SettingCard header={tr('Port settings')}>
        <SettingItem compatKey="legacy" title={tr('Mixed port')} divider>
          <div className="flex">
            {mixedPortInput !== mixedPort && (
              <Button
                size="sm"
                color="primary"
                className="mr-2"
                isDisabled={hasPortConflict()}
                onPress={async () => {
                  await onChangeNeedRestart({ 'mixed-port': mixedPortInput })
                  if (sysProxy?.enable) {
                    triggerSysProxy(true, onlyActiveDevice)
                  }
                }}
              >
                {tr('Confirm')}
              </Button>
            )}
            <Input
              size="sm"
              type="number"
              className="w-25"
              value={mixedPortInput.toString()}
              max={65535}
              min={0}
              onValueChange={(v) => {
                setMixedPortInput(parseInt(v) || 0)
              }}
            />
          </div>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('SOCKS port')} divider>
          <div className="flex">
            {socksPortInput !== socksPort && (
              <Button
                size="sm"
                color="primary"
                className="mr-2"
                isDisabled={hasPortConflict()}
                onPress={() => {
                  onChangeNeedRestart({ 'socks-port': socksPortInput })
                }}
              >
                {tr('Confirm')}
              </Button>
            )}
            <Input
              size="sm"
              type="number"
              className="w-25"
              value={socksPortInput.toString()}
              max={65535}
              min={0}
              onValueChange={(v) => {
                setSocksPortInput(parseInt(v) || 0)
              }}
            />
          </div>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('HTTP port')} divider>
          <div className="flex">
            {httpPortInput !== httpPort && (
              <Button
                size="sm"
                color="primary"
                className="mr-2"
                isDisabled={hasPortConflict()}
                onPress={() => {
                  onChangeNeedRestart({ port: httpPortInput })
                }}
              >
                {tr('Confirm')}
              </Button>
            )}
            <Input
              size="sm"
              type="number"
              className="w-25"
              value={httpPortInput.toString()}
              max={65535}
              min={0}
              onValueChange={(v) => {
                setHttpPortInput(parseInt(v) || 0)
              }}
            />
          </div>
        </SettingItem>
        {platform !== 'win32' && (
          <SettingItem compatKey="legacy" title={tr('Redir port')} divider>
            <div className="flex">
              {redirPortInput !== redirPort && (
                <Button
                  size="sm"
                  color="primary"
                  className="mr-2"
                  isDisabled={hasPortConflict()}
                  onPress={() => {
                    onChangeNeedRestart({ 'redir-port': redirPortInput })
                  }}
                >
                  {tr('Confirm')}
                </Button>
              )}
              <Input
                size="sm"
                type="number"
                className="w-25"
                value={redirPortInput.toString()}
                max={65535}
                min={0}
                onValueChange={(v) => {
                  setRedirPortInput(parseInt(v) || 0)
                }}
              />
            </div>
          </SettingItem>
        )}
        {platform === 'linux' && (
          <SettingItem compatKey="legacy" title={tr('TProxy port')} divider>
            <div className="flex">
              {tproxyPortInput !== tproxyPort && (
                <Button
                  size="sm"
                  color="primary"
                  className="mr-2"
                  isDisabled={hasPortConflict()}
                  onPress={() => {
                    onChangeNeedRestart({ 'tproxy-port': tproxyPortInput })
                  }}
                >
                  {tr('Confirm')}
                </Button>
              )}
              <Input
                size="sm"
                type="number"
                className="w-25"
                value={tproxyPortInput.toString()}
                max={65535}
                min={0}
                onValueChange={(v) => {
                  setTproxyPortInput(parseInt(v) || 0)
                }}
              />
            </div>
          </SettingItem>
        )}
        <SettingItem
          compatKey="legacy"
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
              onChangeNeedRestart({ 'allow-lan': v })
            }}
          />
        </SettingItem>
        {allowLan && (
          <>
            <SettingItem compatKey="legacy" title={tr('Allowed IP ranges')}>
              {lanAllowedIpsInput.join('') !== lanAllowedIps.join('') && (
                <Button
                  size="sm"
                  color="primary"
                  onPress={() => {
                    onChangeNeedRestart({ 'lan-allowed-ips': lanAllowedIpsInput })
                  }}
                >
                  {tr('Confirm')}
                </Button>
              )}
            </SettingItem>
            <EditableList
              items={lanAllowedIpsInput}
              onChange={(items) => setLanAllowedIpsInput(items as string[])}
              placeholder={tr('IP range')}
            />
            <SettingItem compatKey="legacy" title={tr('Blocked IP ranges')}>
              {lanDisallowedIpsInput.join('') !== lanDisallowedIps.join('') && (
                <Button
                  size="sm"
                  color="primary"
                  onPress={() => {
                    onChangeNeedRestart({ 'lan-disallowed-ips': lanDisallowedIpsInput })
                  }}
                >
                  {tr('Confirm')}
                </Button>
              )}
            </SettingItem>
            <EditableList
              items={lanDisallowedIpsInput}
              onChange={(items) => setLanDisallowedIpsInput(items as string[])}
              placeholder={tr('IP range')}
            />
          </>
        )}
        <SettingItem compatKey="legacy" title={tr('User authentication')}>
          {authenticationInput.join() !== authentication.join() && (
            <Button
              size="sm"
              color="primary"
              onPress={() => onChangeNeedRestart({ authentication: authenticationInput })}
            >
              {tr('Confirm')}
            </Button>
          )}
        </SettingItem>
        <EditableList
          items={authenticationInput}
          onChange={(items) => setAuthenticationInput(items as string[])}
          placeholder={tr('Username')}
          part2Placeholder={tr('Password')}
          parse={parseAuth}
          format={formatAuth}
        />
        <SettingItem compatKey="legacy" title={tr('IP ranges exempt from authentication')}>
          {skipAuthPrefixesInput.join('') !== skipAuthPrefixes.join('') && (
            <Button
              size="sm"
              color="primary"
              onPress={() => {
                onChangeNeedRestart({ 'skip-auth-prefixes': skipAuthPrefixesInput })
              }}
            >
              {tr('Confirm')}
            </Button>
          )}
        </SettingItem>
        <EditableList
          items={skipAuthPrefixesInput}
          onChange={(items) => setSkipAuthPrefixesInput(items as string[])}
          placeholder={tr('IP range')}
          disableFirst
          divider={false}
        />
      </SettingCard>
    </>
  )
}

export default PortSetting
