import { tr } from '../../../../shared/i18n'
import React, { useState, useEffect } from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Button, Input, Select, SelectItem, Switch, Tab, Tabs, Tooltip } from '@heroui/react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  copyEnv,
  patchControledMihomoConfig,
  restartCore,
  startNetworkDetection,
  stopNetworkDetection
} from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import { IoIosHelpCircle } from 'react-icons/io'
import { BiCopy, BiHide, BiShow } from 'react-icons/bi'
import EditableList from '../base/base-list-editor'
import { notify } from '@renderer/utils/notification'

const emptyArray: string[] = []

const AdvancedSettings: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    controlDns = true,
    controlSniff = true,
    pauseSSID,
    autoLightweight = false,
    autoLightweightDelay = 60,
    autoLightweightMode = 'core',
    envType = [platform === 'win32' ? 'powershell' : 'bash'],
    networkDetection = false,
    networkDetectionBypass = ['VMware', 'vEthernet'],
    networkDetectionInterval = 10,
    githubToken = ''
  } = appConfig || {}

  const pauseSSIDArray = pauseSSID ?? emptyArray

  const [pauseSSIDInput, setPauseSSIDInput] = useState(pauseSSIDArray)
  const [githubTokenVisible, setGithubTokenVisible] = useState(false)

  const [bypass, setBypass] = useState(networkDetectionBypass)
  const [interval, setInterval] = useState(Math.max(networkDetectionInterval || 10, 1))

  useEffect(() => {
    setPauseSSIDInput(pauseSSIDArray)
  }, [pauseSSIDArray])

  return (
    <SettingCard header={tr('More settings')}>
      <SettingItem
        compatKey="legacy"
        title="GitHub API Token"
        actions={
          <Tooltip
            content={tr(
              'Used for GitHub update checks, downloads and Gist sync. Leave empty for anonymous requests'
            )}
          >
            <Button aria-label={tr('Description')} isIconOnly size="sm" variant="light">
              <IoIosHelpCircle className="text-lg" />
            </Button>
          </Tooltip>
        }
        divider
      >
        <Input
          size="sm"
          className="w-60"
          type={githubTokenVisible ? 'text' : 'password'}
          value={githubToken}
          placeholder="GitHub Personal Access Token"
          onValueChange={(value) => {
            void patchAppConfig({ githubToken: value })
          }}
          endContent={
            <Button
              aria-label={githubTokenVisible ? tr('Hide GitHub token') : tr('Show GitHub token')}
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => setGithubTokenVisible((visible) => !visible)}
            >
              {githubTokenVisible ? <BiHide className="text-lg" /> : <BiShow className="text-lg" />}
            </Button>
          }
        />
      </SettingItem>
      <SettingItem
        compatKey="legacy"
        title={tr('Automatic lightweight mode')}
        actions={
          <Tooltip
            content={tr(
              'Enter lightweight mode after the window has been closed for the specified time'
            )}
          >
            <Button isIconOnly size="sm" variant="light">
              <IoIosHelpCircle className="text-lg" />
            </Button>
          </Tooltip>
        }
        divider
      >
        <Switch
          size="sm"
          isSelected={autoLightweight}
          onValueChange={(v) => {
            patchAppConfig({ autoLightweight: v })
          }}
        />
      </SettingItem>
      {autoLightweight && (
        <>
          <SettingItem compatKey="legacy" title={tr('Lightweight mode behavior')} divider>
            <Tabs
              size="sm"
              color="primary"
              selectedKey={autoLightweightMode}
              onSelectionChange={(v) => {
                patchAppConfig({ autoLightweightMode: v as 'core' | 'tray' })
                if (v === 'core') {
                  patchAppConfig({ autoLightweightDelay: Math.max(autoLightweightDelay, 5) })
                }
              }}
            >
              <Tab key="core" title={tr('Keep only the core')} />
              <Tab key="tray" title={tr('Close only the renderer')} />
            </Tabs>
          </SettingItem>
          <SettingItem compatKey="legacy" title={tr('Lightweight mode delay')} divider>
            <Input
              size="sm"
              className="w-25"
              type="number"
              endContent={tr('seconds')}
              value={autoLightweightDelay.toString()}
              onValueChange={async (v: string) => {
                let num = parseInt(v)
                if (isNaN(num)) num = 0
                const minDelay = autoLightweightMode === 'core' ? 5 : 0
                if (num < minDelay) num = minDelay
                await patchAppConfig({ autoLightweightDelay: num })
              }}
            />
          </SettingItem>
        </>
      )}
      <SettingItem
        compatKey="legacy"
        title={tr('Copy environment variable format')}
        actions={envType.map((type) => (
          <Button
            key={type}
            title={type}
            isIconOnly
            size="sm"
            variant="light"
            onPress={() => copyEnv(type)}
          >
            <BiCopy className="text-lg" />
          </Button>
        ))}
        divider
      >
        <Select
          aria-label={tr('Environment variable type')}
          classNames={{ trigger: 'data-[hover=true]:bg-default-200' }}
          className="w-37.5"
          size="sm"
          selectionMode="multiple"
          selectedKeys={new Set(envType)}
          disallowEmptySelection={true}
          onSelectionChange={async (v) => {
            try {
              await patchAppConfig({
                envType: Array.from(v) as ('bash' | 'fish' | 'cmd' | 'powershell' | 'nushell')[]
              })
            } catch (e) {
              notify(e, { variant: 'danger' })
            }
          }}
        >
          <SelectItem key="bash">Bash</SelectItem>
          <SelectItem key="fish">Fish</SelectItem>
          <SelectItem key="cmd">CMD</SelectItem>
          <SelectItem key="powershell">PowerShell</SelectItem>
          <SelectItem key="nushell">NuShell</SelectItem>
        </Select>
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('Override DNS settings')} divider>
        <Switch
          size="sm"
          isSelected={controlDns}
          onValueChange={async (v) => {
            try {
              await patchAppConfig({ controlDns: v })
              await patchControledMihomoConfig({})
              await restartCore()
            } catch (e) {
              notify(e, { variant: 'danger' })
            }
          }}
        />
      </SettingItem>
      <SettingItem compatKey="legacy" title={tr('Override domain sniffing settings')} divider>
        <Switch
          size="sm"
          isSelected={controlSniff}
          onValueChange={async (v) => {
            try {
              await patchAppConfig({ controlSniff: v })
              await patchControledMihomoConfig({})
              await restartCore()
            } catch (e) {
              notify(e, { variant: 'danger' })
            }
          }}
        />
      </SettingItem>
      <SettingItem
        compatKey="legacy"
        title={tr('Stop core when offline')}
        actions={
          <Tooltip
            content={tr(
              'Stop the core when the network disconnects and restart it when connectivity returns'
            )}
          >
            <Button isIconOnly size="sm" variant="light">
              <IoIosHelpCircle className="text-lg" />
            </Button>
          </Tooltip>
        }
        divider
      >
        <Switch
          size="sm"
          isSelected={networkDetection}
          onValueChange={(v) => {
            patchAppConfig({ networkDetection: v })
            if (v) {
              startNetworkDetection()
            } else {
              stopNetworkDetection()
            }
          }}
        />
      </SettingItem>
      {networkDetection && (
        <>
          <SettingItem compatKey="legacy" title={tr('Connectivity check interval')} divider>
            <div className="flex">
              {interval !== networkDetectionInterval && (
                <Button
                  size="sm"
                  color="primary"
                  className="mr-2"
                  onPress={async () => {
                    await patchAppConfig({ networkDetectionInterval: interval })
                    await startNetworkDetection()
                  }}
                >
                  {tr('Confirm')}
                </Button>
              )}
              <Input
                size="sm"
                type="number"
                className="w-25"
                endContent={tr('seconds')}
                value={interval.toString()}
                min={1}
                onValueChange={(v) => {
                  setInterval(Math.max(parseInt(v) || 10, 1))
                }}
              />
            </div>
          </SettingItem>
          <SettingItem compatKey="legacy" title={tr('Interfaces excluded from detection')}>
            {bypass.length != networkDetectionBypass.length && (
              <Button
                size="sm"
                color="primary"
                onPress={async () => {
                  await patchAppConfig({ networkDetectionBypass: bypass })
                  await startNetworkDetection()
                }}
              >
                {tr('Confirm')}
              </Button>
            )}
          </SettingItem>
          <EditableList items={bypass} onChange={(list) => setBypass(list as string[])} />
        </>
      )}
      <SettingItem compatKey="legacy" title={tr('Use direct connections on specified Wi-Fi SSIDs')}>
        {pauseSSIDInput.join('') !== pauseSSIDArray.join('') && (
          <Button
            size="sm"
            color="primary"
            onPress={() => {
              patchAppConfig({ pauseSSID: pauseSSIDInput })
            }}
          >
            {tr('Confirm')}
          </Button>
        )}
      </SettingItem>
      <EditableList
        items={pauseSSIDInput}
        onChange={(list) => setPauseSSIDInput(list as string[])}
        divider={false}
      />
    </SettingCard>
  )
}

export default AdvancedSettings
