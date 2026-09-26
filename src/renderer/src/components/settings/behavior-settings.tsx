import { tr } from '../../../../shared/i18n'
import React, { useState, useEffect } from 'react'
import { Button, Switch, Tooltip } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import SettingSubgroup from '../base/base-setting-subgroup'
import { KokoSelect, KokoTextField } from '../base/koko-form'
import { KokoSegmentedControl } from '../base/base-controls'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  copyEnv,
  getGitHubTokenConfigured,
  setGitHubToken,
  startNetworkDetection,
  stopNetworkDetection
} from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import { BiCopy, BiHide, BiShow } from 'react-icons/bi'
import EditableList from '../base/base-list-editor'
import PendingFieldAction from '../base/base-pending-field-action'
import { notify } from '@renderer/utils/notification'

const emptyArray: string[] = []

type SettingsSection = 'integration' | 'background' | 'network'

interface Props {
  sections?: SettingsSection[]
  showIntegrationHeading?: boolean
}

const BehaviorSettings: React.FC<Props> = ({
  sections = ['integration', 'background', 'network'],
  showIntegrationHeading = true
}) => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    pauseSSID,
    autoLightweight = false,
    autoLightweightDelay = 60,
    autoLightweightMode = 'core',
    envType = [platform === 'win32' ? 'powershell' : 'bash'],
    networkDetection = false,
    networkDetectionBypass = ['VMware', 'vEthernet'],
    networkDetectionInterval = 10
  } = appConfig || {}

  const pauseSSIDArray = pauseSSID ?? emptyArray

  const [pauseSSIDInput, setPauseSSIDInput] = useState(pauseSSIDArray)
  const [githubTokenVisible, setGithubTokenVisible] = useState(false)
  const [githubTokenDraft, setGithubTokenDraft] = useState('')
  const [githubTokenConfigured, setGithubTokenConfigured] = useState(false)
  const [githubTokenSaving, setGithubTokenSaving] = useState(false)
  const hasIntegrationSection = sections.includes('integration')

  useEffect(() => {
    if (!hasIntegrationSection) return
    void getGitHubTokenConfigured()
      .then(setGithubTokenConfigured)
      .catch((error) => {
        notify(error, { variant: 'danger' })
      })
  }, [hasIntegrationSection])

  const saveGitHubToken = async (token: string): Promise<void> => {
    setGithubTokenSaving(true)
    try {
      await setGitHubToken(token)
      setGithubTokenConfigured(Boolean(token.trim()))
      setGithubTokenDraft('')
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setGithubTokenSaving(false)
    }
  }

  const [bypass, setBypass] = useState(networkDetectionBypass)
  const [interval, setInterval] = useState(Math.max(networkDetectionInterval || 10, 1))

  useEffect(() => {
    setPauseSSIDInput(pauseSSIDArray)
  }, [pauseSSIDArray])

  return (
    <>
      {sections.includes('integration') && (
        <>
          <SettingCard header={showIntegrationHeading ? tr('Developer integration') : undefined}>
            <SettingItem
              contentAlign="end"
              title="GitHub API Token"
              help={tr(
                'Used for GitHub update checks, downloads and Gist sync. Leave empty for anonymous requests'
              )}
              divider
            >
              <div className="flex items-center gap-2">
                {githubTokenConfigured && !githubTokenDraft && (
                  <span className="text-xs text-muted">{tr('Configured')}</span>
                )}
                <KokoTextField
                  className="w-60"
                  type={githubTokenVisible ? 'text' : 'password'}
                  value={githubTokenDraft}
                  placeholder="GitHub Personal Access Token"
                  onChangeValue={setGithubTokenDraft}
                  suffix={
                    <Button
                      aria-label={
                        githubTokenVisible ? tr('Hide GitHub token') : tr('Show GitHub token')
                      }
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      onPress={() => setGithubTokenVisible((visible) => !visible)}
                    >
                      {githubTokenVisible ? (
                        <BiHide className="text-lg" />
                      ) : (
                        <BiShow className="text-lg" />
                      )}
                    </Button>
                  }
                />
                <Button
                  size="sm"
                  isDisabled={!githubTokenDraft.trim() || githubTokenSaving}
                  onPress={() => void saveGitHubToken(githubTokenDraft)}
                >
                  {tr('Save')}
                </Button>
                {githubTokenConfigured && (
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={githubTokenSaving}
                    onPress={() => void saveGitHubToken('')}
                  >
                    {tr('Clear field')}
                  </Button>
                )}
              </div>
            </SettingItem>
          </SettingCard>
          <SettingCard header={tr('Environment integration')}>
            <SettingItem
              contentAlign="end"
              title={tr('Copy environment variable format')}
              actions={envType.map((type) => (
                <Tooltip delay={0} key={type}>
                  <Tooltip.Trigger>
                    <Button
                      aria-label={type}
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      onPress={() => copyEnv(type)}
                    >
                      <BiCopy className="text-lg" />
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>{type}</Tooltip.Content>
                </Tooltip>
              ))}
              divider
            >
              <KokoSelect
                aria-label={tr('Environment variable type')}
                variant="secondary"
                controlWidth="select"
                multiple
                value={envType}
                options={[
                  { id: 'bash', label: 'Bash' },
                  { id: 'fish', label: 'Fish' },
                  { id: 'cmd', label: 'CMD' },
                  { id: 'powershell', label: 'PowerShell' },
                  { id: 'nushell', label: 'NuShell' }
                ]}
                disallowEmptySelection={true}
                onChange={async (value) => {
                  try {
                    if (
                      !(await patchAppConfig({
                        envType: value as ('bash' | 'fish' | 'cmd' | 'powershell' | 'nushell')[]
                      }))
                    )
                      return
                  } catch (e) {
                    notify(e, { variant: 'danger' })
                  }
                }}
              />
            </SettingItem>
          </SettingCard>
        </>
      )}
      {sections.includes('background') && (
        <SettingCard header={tr('Background behavior')}>
          <SettingItem
            contentAlign="end"
            title={tr('Automatic lightweight mode')}
            help={tr(
              'Enter lightweight mode after the window has been closed for the specified time'
            )}
            divider={!autoLightweight}
          >
            <Switch
              size="sm"
              isSelected={autoLightweight}
              onChange={(v) => {
                patchAppConfig({ autoLightweight: v })
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
          {autoLightweight && (
            <SettingSubgroup label={tr('Automatic lightweight mode')}>
              <SettingItem contentAlign="end" title={tr('Lightweight mode behavior')} divider>
                <KokoSegmentedControl
                  ariaLabel={tr('Lightweight mode behavior')}
                  selectedKey={autoLightweightMode}
                  options={[
                    { id: 'core', label: tr('Keep only the core') },
                    { id: 'tray', label: tr('Close only the renderer') }
                  ]}
                  onChange={(v) => {
                    patchAppConfig({ autoLightweightMode: v as 'core' | 'tray' })
                    if (v === 'core') {
                      patchAppConfig({ autoLightweightDelay: Math.max(autoLightweightDelay, 5) })
                    }
                  }}
                />
              </SettingItem>
              <SettingItem contentAlign="end" title={tr('Lightweight mode delay')}>
                <KokoTextField
                  controlWidth="number"
                  type="number"
                  suffix={tr('seconds')}
                  value={autoLightweightDelay.toString()}
                  onChangeValue={async (v: string) => {
                    let num = parseInt(v)
                    if (isNaN(num)) num = 0
                    const minDelay = autoLightweightMode === 'core' ? 5 : 0
                    if (num < minDelay) num = minDelay
                    if (!(await patchAppConfig({ autoLightweightDelay: num }))) return
                  }}
                />
              </SettingItem>
            </SettingSubgroup>
          )}
        </SettingCard>
      )}
      {sections.includes('network') && (
        <SettingCard header={tr('Network behavior')}>
          <SettingItem
            contentAlign="end"
            title={tr('Stop core when offline')}
            help={tr(
              'Stop the core when the network disconnects and restart it when connectivity returns'
            )}
            divider={!networkDetection}
          >
            <Switch
              size="sm"
              isSelected={networkDetection}
              onChange={(v) => {
                patchAppConfig({ networkDetection: v })
                if (v) {
                  startNetworkDetection()
                } else {
                  stopNetworkDetection()
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
          {networkDetection && (
            <SettingSubgroup label={tr('Stop core when offline')}>
              <SettingItem contentAlign="end" title={tr('Connectivity check interval')} divider>
                <div className="flex items-center justify-end gap-2">
                  <KokoTextField
                    type="number"
                    controlWidth="number"
                    suffix={tr('seconds')}
                    value={interval.toString()}
                    min={1}
                    onChangeValue={(v) => {
                      setInterval(Math.max(parseInt(v) || 10, 1))
                    }}
                  />
                  <PendingFieldAction
                    isVisible={interval !== networkDetectionInterval}
                    onPress={async () => {
                      if (!(await patchAppConfig({ networkDetectionInterval: interval }))) return
                      await startNetworkDetection()
                    }}
                  />
                </div>
              </SettingItem>
              <SettingItem contentAlign="end" title={tr('Interfaces excluded from detection')}>
                <PendingFieldAction
                  isVisible={bypass.length != networkDetectionBypass.length}
                  onPress={async () => {
                    if (!(await patchAppConfig({ networkDetectionBypass: bypass }))) return
                    await startNetworkDetection()
                  }}
                />
              </SettingItem>
              <EditableList items={bypass} onChange={(list) => setBypass(list as string[])} />
            </SettingSubgroup>
          )}
          <SettingItem
            contentAlign="end"
            title={tr('Use direct connections on specified Wi-Fi SSIDs')}
          >
            <PendingFieldAction
              isVisible={pauseSSIDInput.join('') !== pauseSSIDArray.join('')}
              onPress={() => patchAppConfig({ pauseSSID: pauseSSIDInput })}
            />
          </SettingItem>
          <EditableList
            items={pauseSSIDInput}
            onChange={(list) => setPauseSSIDInput(list as string[])}
            divider={false}
          />
        </SettingCard>
      )}
    </>
  )
}

export const IntegrationSettings: React.FC = () => (
  <BehaviorSettings sections={['integration']} showIntegrationHeading={false} />
)

export const BackgroundBehaviorSettings: React.FC = () => (
  <BehaviorSettings sections={['background']} />
)

export const NetworkBehaviorSettings: React.FC = () => <BehaviorSettings sections={['network']} />
