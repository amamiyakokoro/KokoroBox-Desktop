import { tr } from '../../../../shared/i18n'
import { platform } from '@renderer/utils/init'
import React, { type ReactNode } from 'react'
import {
  LuAppWindow,
  LuArchiveRestore,
  LuBrush,
  LuCommand,
  LuCpu,
  LuNetwork,
  LuWrench
} from 'react-icons/lu'
import Actions from './actions'
import AppearanceConfig from './appearance-confis'
import {
  BackgroundBehaviorSettings,
  IntegrationSettings,
  NetworkBehaviorSettings
} from './behavior-settings'
import CoreRuntimeConfig from './core-runtime-config'
import GeneralConfig, { PerformanceConfig } from './general-config'
import ShortcutConfig from './shortcut-config'
import SiderConfig from './sider-config'
import SubscriptionIntegrationSettings from './subscription-integration-settings'
import WebdavConfig from './webdav-config'
import EnvSetting from '../mihomo/env-setting'
import LogSetting from '../mihomo/log-setting'
import Sysproxy from './network/system-proxy-settings'
import Tun from './network/tun-settings'

export type SettingsCategory =
  'general' | 'appearance' | 'network' | 'core' | 'data' | 'shortcuts' | 'diagnostics'

type SettingsPlatform = 'win32' | 'darwin' | 'linux'

export interface SettingsEntryDefinition {
  id: string
  label: string
  keywords?: string[]
  targetLabel?: string
  fallbackLabel?: string
  platforms?: SettingsPlatform[]
  panel?: string
}

export interface SettingsPanelDefinition {
  key: string
  label: string
  entries: SettingsEntryDefinition[]
  content: () => ReactNode
}

export interface SettingsCategoryDefinition {
  key: SettingsCategory
  label: string
  icon: React.ComponentType<{ className?: string }>
  entries: SettingsEntryDefinition[]
  content?: () => ReactNode
  panels?: SettingsPanelDefinition[]
}

const entry = (
  id: string,
  label: string,
  fallbackLabel: string,
  options: Pick<SettingsEntryDefinition, 'keywords' | 'platforms' | 'targetLabel' | 'panel'> = {}
): SettingsEntryDefinition => ({ id, label, fallbackLabel, ...options })

const availableOnCurrentPlatform = (setting: SettingsEntryDefinition): boolean =>
  !setting.platforms || setting.platforms.includes(platform as SettingsPlatform)

export const getSettingsCategories = (): SettingsCategoryDefinition[] => {
  const networkPanels: SettingsPanelDefinition[] = [
    {
      key: 'system-proxy',
      label: tr('System proxy'),
      entries: [
        entry('system-proxy-host', tr('Proxy host'), tr('System proxy settings'), {
          panel: 'system-proxy'
        }),
        entry('system-proxy-mode', tr('Proxy mode'), tr('System proxy settings'), {
          panel: 'system-proxy'
        }),
        entry('system-proxy-pac', tr('PAC script'), tr('System proxy settings'), {
          panel: 'system-proxy'
        }),
        entry('system-proxy-method', tr('Configuration method'), tr('System proxy settings'), {
          panel: 'system-proxy'
        }),
        entry('system-proxy-terminal', tr('Terminal proxy'), tr('System proxy settings'), {
          panel: 'system-proxy',
          platforms: ['linux']
        }),
        entry(
          'system-proxy-active-interfaces',
          tr('Active interfaces only'),
          tr('System proxy settings'),
          { panel: 'system-proxy', platforms: ['win32', 'darwin'] }
        ),
        entry('system-proxy-watchdog', tr('System proxy watchdog'), tr('System proxy settings'), {
          panel: 'system-proxy'
        }),
        entry(
          'system-proxy-watchdog-notifications',
          tr('Watchdog notifications'),
          tr('System proxy settings'),
          { panel: 'system-proxy' }
        ),
        entry('system-proxy-bypass', tr('Proxy bypass list'), tr('System proxy settings'), {
          panel: 'system-proxy'
        })
      ],
      content: () => <Sysproxy embedded />
    },
    {
      key: 'tun',
      label: tr('TUN mode'),
      entries: [
        entry('tun-platform-integration', tr('Platform integration'), tr('TUN settings'), {
          panel: 'tun',
          platforms: ['win32', 'darwin']
        }),
        entry('tun-network-stack', tr('TUN network stack'), tr('TUN settings'), { panel: 'tun' }),
        entry('tun-interface-name', tr('TUN interface name'), tr('TUN settings'), {
          panel: 'tun',
          platforms: ['win32', 'linux']
        }),
        entry('tun-strict-routing', tr('Strict routing'), tr('TUN settings'), {
          panel: 'tun',
          platforms: ['win32', 'linux']
        }),
        entry('tun-auto-routes', tr('Configure routes automatically'), tr('TUN settings'), {
          panel: 'tun'
        }),
        entry(
          'tun-auto-redirect',
          tr('Configure TCP redirection automatically'),
          tr('TUN settings'),
          { panel: 'tun', platforms: ['linux'] }
        ),
        entry(
          'tun-auto-interface',
          tr('Select outbound interface automatically'),
          tr('TUN settings'),
          { panel: 'tun' }
        ),
        entry('tun-icmp-forwarding', tr('ICMP forwarding'), tr('TUN settings'), { panel: 'tun' }),
        entry('tun-mtu', 'MTU', tr('TUN settings'), { panel: 'tun' }),
        entry(
          'tun-dns-hijacking',
          tr('DNS hijacking targets, separated by commas'),
          tr('TUN settings'),
          { panel: 'tun' }
        ),
        entry('tun-excluded-ranges', tr('Exclude custom IP ranges'), tr('TUN settings'), {
          panel: 'tun'
        })
      ],
      content: () => <Tun embedded />
    }
  ]

  return (
    [
      {
        key: 'general',
        label: tr('General'),
        icon: LuAppWindow,
        entries: [
          entry('interface-language', tr('Interface language'), tr('General')),
          entry('launch-at-startup', tr('Launch at startup'), tr('General')),
          entry('start-minimized', tr('Start minimized'), tr('General')),
          entry('automatic-update-checks', tr('Check for updates automatically'), tr('General')),
          entry('update-channel', tr('Update channel'), tr('General')),
          entry('notification-style', tr('Notification style'), tr('General')),
          entry(
            'automatic-lightweight-mode',
            tr('Automatic lightweight mode'),
            tr('Background behavior')
          ),
          entry(
            'lightweight-mode-behavior',
            tr('Lightweight mode behavior'),
            tr('Background behavior')
          ),
          entry('lightweight-mode-delay', tr('Lightweight mode delay'), tr('Background behavior'))
        ],
        content: () => (
          <>
            <GeneralConfig />
            <BackgroundBehaviorSettings />
          </>
        )
      },
      {
        key: 'appearance',
        label: tr('Appearance and interface'),
        icon: LuBrush,
        entries: [
          entry('show-floating-window', tr('Show floating window'), tr('Appearance')),
          entry(
            'spin-floating-icon',
            tr('Rotate floating icon based on network speed'),
            tr('Appearance')
          ),
          entry('disable-tray-icon', tr('Disable tray icon'), tr('Appearance')),
          entry('custom-tray-icon', tr('Custom tray icon'), tr('Appearance')),
          entry('tray-proxy-details', tr('Show proxy details in tray menu'), tr('Appearance'), {
            platforms: ['win32', 'darwin']
          }),
          entry('tray-latency-layout', tr('Tray menu latency layout'), tr('Appearance'), {
            platforms: ['win32', 'darwin']
          }),
          entry(
            'show-network-speed',
            tr('Show network speed in the {0}', [
              platform === 'win32'
                ? tr('Taskbar')
                : platform === 'darwin'
                  ? tr('Menu bar')
                  : tr('System tray')
            ]),
            tr('Appearance')
          ),
          entry('show-dock-icon', tr('Show Dock icon'), tr('Appearance'), {
            platforms: ['darwin']
          }),
          entry('system-title-bar', tr('Use system title bar'), tr('Appearance')),
          entry('window-drag-area', tr('Enable window drag area'), tr('Appearance')),
          entry('show-update-button', tr('Show update button'), tr('Appearance')),
          entry('background-color', tr('Background color'), tr('Appearance')),
          entry('theme', tr('Theme'), tr('Appearance')),
          entry('disable-gpu', tr('Disable GPU acceleration'), tr('Performance')),
          entry('reduce-animations', tr('Reduce animations'), tr('Performance')),
          entry('sidebar-settings', tr('Sidebar settings'), tr('Sidebar settings')),
          entry('system-proxy-card', tr('System proxy'), tr('Sidebar settings')),
          entry('tun-card', tr('TUN mode'), tr('Sidebar settings')),
          entry('application-routing-card', tr('Application routing'), tr('Sidebar settings')),
          entry('subscriptions-card', tr('Subscriptions'), tr('Sidebar settings')),
          entry('proxy-groups-card', tr('Proxy groups'), tr('Sidebar settings')),
          entry('rules-card', tr('Rules'), tr('Sidebar settings')),
          entry('connections-card', tr('Connections'), tr('Sidebar settings'))
        ],
        content: () => (
          <>
            <AppearanceConfig />
            <PerformanceConfig />
            <SiderConfig />
          </>
        )
      },
      {
        key: 'network',
        label: tr('Network'),
        icon: LuNetwork,
        entries: networkPanels.flatMap((panel) => panel.entries),
        panels: networkPanels
      },
      {
        key: 'core',
        label: tr('Core and system'),
        icon: LuCpu,
        entries: [
          entry('core-version', tr('Core version'), tr('Core runtime')),
          entry('system-core-path', tr('Choose system core path'), tr('Core runtime')),
          entry('core-process-priority', tr('Core process priority'), tr('Core runtime')),
          entry('core-run-mode', tr('Run mode'), tr('Core runtime')),
          entry('service-core-run-mode', tr('Service core execution mode'), tr('Core runtime'), {
            platforms: ['linux']
          }),
          entry('startup-detection', tr('Startup detection method'), tr('Core runtime'), {
            platforms: ['darwin', 'linux']
          }),
          entry('elevation-status', tr('Elevation status'), tr('Service management'), {
            platforms: ['win32', 'linux']
          }),
          entry('service-status', tr('Service status'), tr('Service management')),
          entry('disable-system-ca', tr('Disable system CAs'), tr('Environment variables')),
          entry('disable-built-in-ca', tr('Disable built-in CAs'), tr('Environment variables')),
          entry(
            'disable-loopback-detection',
            tr('Disable loopback detection'),
            tr('Environment variables')
          ),
          entry('disable-nftables', tr('Disable nftables'), tr('Environment variables'), {
            platforms: ['linux']
          }),
          entry('trusted-path', tr('Trusted path'), tr('Environment variables')),
          entry('stop-core-offline', tr('Stop core when offline'), tr('Network behavior')),
          entry(
            'connectivity-check-interval',
            tr('Connectivity check interval'),
            tr('Network behavior')
          ),
          entry(
            'excluded-network-interfaces',
            tr('Interfaces excluded from detection'),
            tr('Network behavior')
          ),
          entry(
            'direct-wifi-ssids',
            tr('Use direct connections on specified Wi-Fi SSIDs'),
            tr('Network behavior')
          )
        ],
        content: () => (
          <>
            <CoreRuntimeConfig />
            <EnvSetting />
            <NetworkBehaviorSettings />
          </>
        )
      },
      {
        key: 'data',
        label: tr('Data and integrations'),
        icon: LuArchiveRestore,
        entries: [
          entry('github-token', 'GitHub API Token', tr('Developer integration')),
          entry(
            'copy-environment-format',
            tr('Copy environment variable format'),
            tr('Environment integration')
          ),
          entry(
            'separate-profile-workdir',
            tr('Use a separate working directory for each profile'),
            tr('Subscription data')
          ),
          entry('subscription-user-agent', tr('Subscription user agent'), tr('Subscription data')),
          entry(
            'gist-runtime-sync',
            tr('Sync runtime configuration to Gist'),
            tr('Gist synchronization')
          ),
          entry('gist-encryption', tr('Encrypt Gist configuration'), tr('Gist synchronization')),
          entry('gist-age-public-key', tr('Gist age public key'), tr('Gist synchronization')),
          entry('gist-age-private-key', tr('Gist age private key'), tr('Gist synchronization')),
          entry('webdav-url', tr('WebDAV URL'), tr('WebDAV backup')),
          entry('webdav-directory', tr('WebDAV backup directory'), tr('WebDAV backup')),
          entry('webdav-username', tr('WebDAV username'), tr('WebDAV backup')),
          entry('webdav-password', tr('WebDAV password'), tr('WebDAV backup'))
        ],
        content: () => (
          <>
            <SubscriptionIntegrationSettings />
            <WebdavConfig />
            <IntegrationSettings />
          </>
        )
      },
      {
        key: 'shortcuts',
        label: tr('Keyboard shortcuts'),
        icon: LuCommand,
        entries: [
          entry('shortcut-toggle-window', tr('Toggle window'), tr('Keyboard shortcuts')),
          entry(
            'shortcut-toggle-floating-window',
            tr('Toggle floating window'),
            tr('Keyboard shortcuts')
          ),
          entry(
            'shortcut-toggle-system-proxy',
            tr('Toggle system proxy'),
            tr('Keyboard shortcuts')
          ),
          entry('shortcut-toggle-tun', tr('Toggle TUN mode'), tr('Keyboard shortcuts')),
          entry('shortcut-rule-mode', tr('Switch to rule mode'), tr('Keyboard shortcuts')),
          entry('shortcut-global-mode', tr('Switch to global mode'), tr('Keyboard shortcuts')),
          entry('shortcut-direct-mode', tr('Switch to direct mode'), tr('Keyboard shortcuts')),
          entry('shortcut-keep-core', tr('Quit and keep core running'), tr('Keyboard shortcuts')),
          entry('shortcut-restart-app', tr('Restart app'), tr('Keyboard shortcuts'))
        ],
        content: () => <ShortcutConfig />
      },
      {
        key: 'diagnostics',
        label: tr('Diagnostics and about'),
        icon: LuWrench,
        entries: [
          entry('save-logs', tr('Save logs'), tr('Application logs')),
          entry('log-retention-days', tr('Log retention days'), tr('Application logs')),
          entry('log-size-limit', tr('Log file size limit'), tr('Application logs')),
          entry('live-log-limit', tr('Live log entry limit'), tr('Application logs')),
          entry('guided-tour', tr('Open guided tour'), tr('Application actions')),
          entry('check-updates', tr('Check for updates'), tr('Application actions')),
          entry('clear-cache', tr('Clear cache'), tr('Diagnostics')),
          entry('heap-snapshot', tr('Create heap snapshot'), tr('Diagnostics')),
          entry('reset-app', tr('Reset app'), tr('Danger zone')),
          entry('quit-keep-core', tr('Quit and keep core running'), tr('Danger zone')),
          entry('quit-app', tr('Quit app'), tr('Danger zone')),
          entry('app-version', tr('App version'), tr('Version information'))
        ],
        content: () => (
          <>
            <LogSetting />
            <Actions />
          </>
        )
      }
    ] satisfies SettingsCategoryDefinition[]
  ).map((category) => ({
    ...category,
    entries: category.entries.filter(availableOnCurrentPlatform),
    panels: category.panels?.map((panel) => ({
      ...panel,
      entries: panel.entries.filter(availableOnCurrentPlatform)
    }))
  }))
}

export const legacyCategoryAliases: Readonly<Record<string, SettingsCategory>> = {
  sidebar: 'appearance',
  logs: 'diagnostics',
  backup: 'data',
  advanced: 'general',
  maintenance: 'diagnostics'
}

export const findSettingsEntry = (
  categories: SettingsCategoryDefinition[],
  id: string | null
): { category: SettingsCategoryDefinition; entry: SettingsEntryDefinition } | undefined => {
  if (!id) return undefined
  for (const category of categories) {
    const setting = category.entries.find((item) => item.id === id)
    if (setting) return { category, entry: setting }
  }
  return undefined
}
