import { tr } from '../../../../shared/i18n'
import { Button, Select, SelectItem, Tab, Tabs } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import PermissionModal from '../mihomo/permission-modal'
import ServiceModal from '../mihomo/service-modal'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { platform } from '@renderer/utils/init'
import { IoMdCloudDownload } from 'react-icons/io'
import PubSub from 'pubsub-js'
import {
  findSystemMihomo,
  initService,
  installService,
  mihomoUpgrade,
  restartCore,
  restartService,
  startService,
  uninstallService
} from '@renderer/utils/ipc'
import React, { useEffect, useState } from 'react'
import { notify } from '@renderer/utils/notification'
import { systemCoreOnlyBuild } from '../../../../shared/build-flags'

let systemCorePathsCache: string[] | null = null
let cachePromise: Promise<string[]> | null = null

const getSystemCorePaths = async (): Promise<string[]> => {
  if (systemCorePathsCache !== null) return systemCorePathsCache
  if (cachePromise !== null) return cachePromise

  cachePromise = findSystemMihomo()
    .then((paths) => {
      systemCorePathsCache = paths
      cachePromise = null
      return paths
    })
    .catch(() => {
      cachePromise = null
      return []
    })

  return cachePromise
}

getSystemCorePaths().catch(() => {})

type CoreRuntimeSection = 'runtime' | 'service'

interface Props {
  sections?: CoreRuntimeSection[]
}

const CoreRuntimeConfig: React.FC<Props> = ({ sections = ['runtime', 'service'] }) => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { tun } = controledMihomoConfig || {}
  const {
    core = 'mihomo',
    corePermissionMode = 'elevated',
    serviceRunMode = 'auto',
    coreStartupMode = 'post-up',
    mihomoCpuPriority = 'PRIORITY_NORMAL'
  } = appConfig || {}

  const [upgrading, setUpgrading] = useState(false)
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [systemCorePaths, setSystemCorePaths] = useState<string[]>(systemCorePathsCache || [])
  const [loadingPaths, setLoadingPaths] = useState(systemCorePathsCache === null)

  useEffect(() => {
    if (systemCorePathsCache !== null) return

    getSystemCorePaths()
      .then(setSystemCorePaths)
      .catch(() => {})
      .finally(() => setLoadingPaths(false))
  }, [])

  const handleConfigChangeWithRestart = async (key: string, value: unknown): Promise<void> => {
    try {
      await patchAppConfig({ [key]: value })
      await restartCore()
      PubSub.publish('mihomo-core-changed')
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  const handleCoreUpgrade = async (): Promise<void> => {
    try {
      setUpgrading(true)
      await mihomoUpgrade(core === 'mihomo' ? 'release' : 'alpha')
      setTimeout(() => PubSub.publish('mihomo-core-changed'), 2000)
    } catch (e) {
      if (typeof e === 'string' && e.includes('already using latest version')) {
        notify(tr('Already up to date'))
      } else {
        notify(e, { variant: 'danger' })
      }
    } finally {
      setUpgrading(false)
    }
  }

  const handleCoreChange = async (newCore: 'mihomo' | 'mihomo-alpha' | 'system'): Promise<void> => {
    if (newCore === 'system') {
      const paths = await getSystemCorePaths()
      if (paths.length === 0) {
        notify(tr('System core not found'), {
          body: tr(
            'No usable mihomo or clash core found on the system. Switched back to the built-in core'
          )
        })
        return
      }
      if (!appConfig?.systemCorePath || !paths.includes(appConfig.systemCorePath)) {
        await patchAppConfig({ systemCorePath: paths[0] })
      }
    }
    await handleConfigChangeWithRestart('core', newCore)
  }

  const handlePermissionModeChange = async (key: string): Promise<void> => {
    if (key === corePermissionMode) return
    if (platform === 'darwin' && key === 'elevated' && tun?.enable) {
      notify(tr('macOS TUN requires the core to run through KokoroBox Service.'), {
        variant: 'warning'
      })
      return
    }
    try {
      await patchAppConfig({ corePermissionMode: key as 'elevated' | 'service' })
      await restartCore()
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  return (
    <>
      {!systemCoreOnlyBuild && showPermissionModal && (
        <PermissionModal onChange={setShowPermissionModal} />
      )}
      {showServiceModal && (
        <ServiceModal
          onChange={setShowServiceModal}
          onInit={async () => {
            await initService()
            notify(tr('Service initialized'))
          }}
          {...(!systemCoreOnlyBuild
            ? {
                onInstall: async () => {
                  await installService()
                  notify(tr('Service installed or repaired'))
                },
                onUninstall: async () => {
                  await uninstallService()
                  notify(tr('Service uninstalled'))
                },
                onStart: async () => {
                  await startService()
                  notify(tr('Service started'))
                },
                onRestart: async () => {
                  await restartService()
                  notify(tr('Service restarted'))
                }
              }
            : {})}
        />
      )}
      {sections.includes('runtime') && (
        <SettingCard header={tr('Core runtime')}>
          <SettingItem
            compatKey="legacy"
            title={tr('Core version')}
            actions={
              !systemCoreOnlyBuild && (core === 'mihomo' || core === 'mihomo-alpha') ? (
                <Button
                  size="sm"
                  isIconOnly
                  variant="light"
                  isLoading={upgrading}
                  onPress={handleCoreUpgrade}
                >
                  <IoMdCloudDownload className="text-lg" />
                </Button>
              ) : null
            }
            divider
          >
            {systemCoreOnlyBuild ? (
              <span className="text-sm text-foreground-600">{tr('System core')}</span>
            ) : (
              <Select
                aria-label={tr('Core version')}
                classNames={{ trigger: 'data-[hover=true]:bg-default-200' }}
                className="w-37.5"
                size="sm"
                selectedKeys={new Set([core])}
                disallowEmptySelection
                onSelectionChange={(value) =>
                  handleCoreChange(value.currentKey as 'mihomo' | 'mihomo-alpha' | 'system')
                }
              >
                <SelectItem key="mihomo">{tr('Built-in stable')}</SelectItem>
                <SelectItem key="mihomo-alpha">{tr('Built-in preview')}</SelectItem>
                <SelectItem key="system">{tr('Use system core')}</SelectItem>
              </Select>
            )}
          </SettingItem>
          {core === 'system' && (
            <SettingItem compatKey="legacy" title={tr('Choose system core path')} divider>
              <Select
                aria-label={tr('System core path')}
                classNames={{ trigger: 'data-[hover=true]:bg-default-200' }}
                className="w-87.5"
                size="sm"
                selectedKeys={new Set([appConfig?.systemCorePath || ''])}
                disallowEmptySelection={systemCorePaths.length > 0}
                isDisabled={loadingPaths}
                onSelectionChange={(value) => {
                  const selectedPath = value.currentKey as string
                  if (selectedPath) handleConfigChangeWithRestart('systemCorePath', selectedPath)
                }}
              >
                {loadingPaths ? (
                  <SelectItem key="">{tr('Searching for a system core...')}</SelectItem>
                ) : systemCorePaths.length > 0 ? (
                  systemCorePaths.map((path) => <SelectItem key={path}>{path}</SelectItem>)
                ) : (
                  <SelectItem key="">{tr('System core not found')}</SelectItem>
                )}
              </Select>
            </SettingItem>
          )}
          <SettingItem compatKey="legacy" title={tr('Core process priority')} divider>
            <Select
              aria-label={tr('Core process priority')}
              classNames={{ trigger: 'data-[hover=true]:bg-default-200' }}
              className="w-37.5"
              size="sm"
              selectedKeys={new Set([mihomoCpuPriority])}
              disallowEmptySelection
              onSelectionChange={(value) =>
                handleConfigChangeWithRestart('mihomoCpuPriority', value.currentKey as Priority)
              }
            >
              <SelectItem key="PRIORITY_HIGHEST">{tr('Real time')}</SelectItem>
              <SelectItem key="PRIORITY_HIGH">{tr('High')}</SelectItem>
              <SelectItem key="PRIORITY_ABOVE_NORMAL">{tr('Above normal')}</SelectItem>
              <SelectItem key="PRIORITY_NORMAL">{tr('Normal')}</SelectItem>
              <SelectItem key="PRIORITY_BELOW_NORMAL">{tr('Below normal')}</SelectItem>
              <SelectItem key="PRIORITY_LOW">{tr('Low')}</SelectItem>
            </Select>
          </SettingItem>
          <SettingItem compatKey="legacy" title={tr('Run mode')} divider>
            <Tabs
              size="sm"
              color="primary"
              selectedKey={corePermissionMode}
              onSelectionChange={(key) => handlePermissionModeChange(key as string)}
            >
              <Tab key="elevated" title={tr('Direct run')} />
              <Tab key="service" title={tr('System service')} />
            </Tabs>
          </SettingItem>
          {platform === 'linux' && corePermissionMode === 'service' && (
            <SettingItem compatKey="legacy" title={tr('Service core execution mode')} divider>
              <Tabs
                size="sm"
                color="primary"
                selectedKey={serviceRunMode}
                onSelectionChange={(key) => handleConfigChangeWithRestart('serviceRunMode', key)}
              >
                <Tab key="auto" title={tr('Automatic')} />
                <Tab key="sandbox" title={tr('Sandbox')} />
                <Tab key="direct" title={tr('Start directly')} />
              </Tabs>
            </SettingItem>
          )}
          {corePermissionMode !== 'service' && platform !== 'win32' && (
            <SettingItem compatKey="legacy" title={tr('Startup detection method')} divider>
              <Tabs
                size="sm"
                color="primary"
                selectedKey={coreStartupMode}
                onSelectionChange={(key) => handleConfigChangeWithRestart('coreStartupMode', key)}
              >
                <Tab key="post-up" title="Post Up" />
                <Tab key="log" title={tr('Log parsing')} />
              </Tabs>
            </SettingItem>
          )}
        </SettingCard>
      )}
      {sections.includes('service') && (
        <SettingCard header={tr('Service management')}>
          {!systemCoreOnlyBuild && platform !== 'darwin' && (
            <SettingItem compatKey="legacy" title={tr('Elevation status')} divider>
              <Button size="sm" variant="flat" onPress={() => setShowPermissionModal(true)}>
                {tr('Manage')}
              </Button>
            </SettingItem>
          )}
          <SettingItem compatKey="legacy" title={tr('Service status')}>
            <Button
              size="sm"
              color="primary"
              variant="flat"
              onPress={() => setShowServiceModal(true)}
            >
              {tr('Manage')}
            </Button>
          </SettingItem>
        </SettingCard>
      )}
    </>
  )
}

export const CoreExecutionSettings: React.FC = () => <CoreRuntimeConfig sections={['runtime']} />

export const ServiceManagementSettings: React.FC = () => (
  <CoreRuntimeConfig sections={['service']} />
)

export default CoreRuntimeConfig
