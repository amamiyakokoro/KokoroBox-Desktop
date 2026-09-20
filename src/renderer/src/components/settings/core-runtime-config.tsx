import { tr } from '../../../../shared/i18n'
import { Button } from '@heroui/react'
import { KokoSelect } from '../base/koko-form'
import { KokoSegmentedControl } from '../base/base-controls'
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
  showSectionHeadings?: boolean
}

const CoreRuntimeConfig: React.FC<Props> = ({
  sections = ['runtime', 'service'],
  showSectionHeadings = true
}) => {
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
        <SettingCard header={showSectionHeadings ? tr('Core runtime') : undefined}>
          <SettingItem
            contentAlign="end"
            title={tr('Core version')}
            actions={
              !systemCoreOnlyBuild && (core === 'mihomo' || core === 'mihomo-alpha') ? (
                <Button
                  size="sm"
                  isIconOnly
                  variant="ghost"
                  isPending={upgrading}
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
              <KokoSelect
                aria-label={tr('Core version')}
                variant="secondary"
                controlWidth="select"
                value={core}
                options={[
                  {
                    id: 'mihomo',
                    label: tr('Built-in stable'),
                    description: tr('Recommended for most users')
                  },
                  {
                    id: 'mihomo-alpha',
                    label: tr('Built-in preview'),
                    description: tr('Newest features; may be less stable')
                  },
                  {
                    id: 'system',
                    label: tr('Use system core'),
                    description: tr('Use an externally installed Mihomo binary')
                  }
                ]}
                disallowEmptySelection
                onChange={(value) =>
                  handleCoreChange(value as 'mihomo' | 'mihomo-alpha' | 'system')
                }
              />
            )}
          </SettingItem>
          {core === 'system' && (
            <SettingItem contentAlign="end" title={tr('Choose system core path')} divider>
              <KokoSelect
                aria-label={tr('System core path')}
                variant="secondary"
                controlWidth="path"
                value={appConfig?.systemCorePath || ''}
                options={
                  loadingPaths
                    ? [{ id: '', label: tr('Searching for a system core...') }]
                    : systemCorePaths.length > 0
                      ? systemCorePaths.map((path) => ({ id: path, label: path }))
                      : [{ id: '', label: tr('System core not found') }]
                }
                disallowEmptySelection={systemCorePaths.length > 0}
                isDisabled={loadingPaths}
                onChange={(selectedPath) => {
                  if (selectedPath) handleConfigChangeWithRestart('systemCorePath', selectedPath)
                }}
              />
            </SettingItem>
          )}
          <SettingItem
            contentAlign="end"
            title={tr('Core process priority')}
            help={tr(
              'Higher priorities may improve responsiveness under load, but real-time priority can reduce overall system responsiveness.'
            )}
            divider
          >
            <KokoSelect
              aria-label={tr('Core process priority')}
              variant="secondary"
              controlWidth="select"
              value={mihomoCpuPriority}
              options={[
                { id: 'PRIORITY_HIGHEST', label: tr('Real time') },
                { id: 'PRIORITY_HIGH', label: tr('High') },
                { id: 'PRIORITY_ABOVE_NORMAL', label: tr('Above normal') },
                { id: 'PRIORITY_NORMAL', label: tr('Normal') },
                { id: 'PRIORITY_BELOW_NORMAL', label: tr('Below normal') },
                { id: 'PRIORITY_LOW', label: tr('Low') }
              ]}
              disallowEmptySelection
              onChange={(value) =>
                handleConfigChangeWithRestart('mihomoCpuPriority', value as Priority)
              }
            />
          </SettingItem>
          <SettingItem
            contentAlign="end"
            title={tr('Run mode')}
            help={tr(
              'Direct run starts the core with elevated permissions. System service keeps privileged features available in the background.'
            )}
            divider
          >
            <KokoSegmentedControl
              ariaLabel={tr('Run mode')}
              selectedKey={corePermissionMode}
              options={[
                { id: 'elevated', label: tr('Direct run') },
                { id: 'service', label: tr('System service') }
              ]}
              onChange={handlePermissionModeChange}
            />
          </SettingItem>
          {platform === 'linux' && corePermissionMode === 'service' && (
            <SettingItem
              contentAlign="end"
              title={tr('Service core execution mode')}
              help={tr(
                'Automatic is recommended. Sandbox isolates the service core; Start directly runs it without sandboxing.'
              )}
              divider
            >
              <KokoSegmentedControl
                ariaLabel={tr('Service core execution mode')}
                selectedKey={serviceRunMode}
                options={[
                  { id: 'auto', label: tr('Automatic') },
                  { id: 'sandbox', label: tr('Sandbox') },
                  { id: 'direct', label: tr('Start directly') }
                ]}
                onChange={(key) => handleConfigChangeWithRestart('serviceRunMode', key)}
              />
            </SettingItem>
          )}
          {corePermissionMode !== 'service' && platform !== 'win32' && (
            <SettingItem
              contentAlign="end"
              title={tr('Startup detection method')}
              help={tr(
                'Post Up waits for the configured startup hook. Log parsing detects readiness from core logs.'
              )}
              divider
            >
              <KokoSegmentedControl
                ariaLabel={tr('Startup detection method')}
                selectedKey={coreStartupMode}
                options={[
                  { id: 'post-up', label: 'Post Up' },
                  { id: 'log', label: tr('Log parsing') }
                ]}
                onChange={(key) => handleConfigChangeWithRestart('coreStartupMode', key)}
              />
            </SettingItem>
          )}
        </SettingCard>
      )}
      {sections.includes('service') && (
        <SettingCard header={showSectionHeadings ? tr('Service management') : undefined}>
          {!systemCoreOnlyBuild && platform !== 'darwin' && (
            <SettingItem contentAlign="end" title={tr('Elevation status')} divider>
              <Button size="sm" variant="secondary" onPress={() => setShowPermissionModal(true)}>
                {tr('Manage')}
              </Button>
            </SettingItem>
          )}
          <SettingItem contentAlign="end" title={tr('Service status')}>
            <Button
              size="sm"
              className="text-primary"
              variant="secondary"
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

export const CoreExecutionSettings: React.FC = () => (
  <CoreRuntimeConfig sections={['runtime']} showSectionHeadings={false} />
)

export const ServiceManagementSettings: React.FC = () => (
  <CoreRuntimeConfig sections={['service']} showSectionHeadings={false} />
)

export default CoreRuntimeConfig
