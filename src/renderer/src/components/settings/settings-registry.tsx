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
import { CoreExecutionSettings, ServiceManagementSettings } from './core-runtime-config'
import GeneralConfig, { PerformanceConfig } from './general-config'
import ShortcutConfig from './shortcut-config'
import SiderConfig from './sider-config'
import {
  GistIntegrationSettings,
  SubscriptionDataSettings
} from './subscription-integration-settings'
import WebdavConfig from './webdav-config'
import EnvSetting from '../mihomo/env-setting'
import LogSetting from '../mihomo/log-setting'
import Sysproxy from './network/system-proxy-settings'
import Tun from './network/tun-settings'
import DNS from './network/dns-settings'
import Mihomo from './network/mihomo-settings'
import Sniffer from './network/sniffer-settings'
import GeoDataSettings from './geo-data-settings'

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
    },
    {
      key: 'dns',
      label: 'DNS',
      entries: [
        entry('dns-override', tr('Override DNS settings'), tr('DNS settings'), { panel: 'dns' }),
        entry('dns-ipv6', 'IPv6', tr('DNS settings'), { panel: 'dns' }),
        entry('dns-policy', tr('DNS policy'), tr('DNS settings'), { panel: 'dns' }),
        entry('dns-mapping-mode', tr('Domain mapping mode'), tr('DNS settings'), { panel: 'dns' }),
        entry('dns-fake-ip-range', tr('Fake IP range (IPv4)'), tr('Fake IP settings'), {
          panel: 'dns'
        }),
        entry('dns-fake-ip-range6', tr('Fake IP range (IPv6)'), tr('Fake IP settings'), {
          panel: 'dns'
        }),
        entry('dns-fake-ip-filter-mode', tr('Fake-IP filter mode'), tr('Fake IP settings'), {
          panel: 'dns'
        }),
        entry('dns-fake-ip-filter', tr('Fake IP filter'), tr('Fake IP settings'), {
          panel: 'dns'
        }),
        entry('dns-bootstrap-servers', tr('Bootstrap DNS servers'), tr('DNS servers'), {
          panel: 'dns'
        }),
        entry('dns-default-servers', tr('Default DNS servers'), tr('DNS servers'), {
          panel: 'dns'
        }),
        entry(
          'dns-routing-rules',
          tr('Follow routing rules for connections'),
          tr('Advanced DNS settings'),
          {
            panel: 'dns'
          }
        ),
        entry(
          'dns-direct-servers',
          tr('Direct-connection DNS servers'),
          tr('Advanced DNS settings'),
          {
            panel: 'dns'
          }
        ),
        entry('dns-proxy-servers', tr('Proxy DNS servers'), tr('Advanced DNS settings'), {
          panel: 'dns'
        }),
        entry('dns-fallback-servers', tr('Fallback DNS servers'), tr('Advanced DNS settings'), {
          panel: 'dns'
        }),
        entry('dns-cache', tr('DNS cache algorithm'), tr('Advanced DNS settings'), {
          panel: 'dns'
        }),
        entry('dns-system-hosts', tr('Use system hosts'), tr('Advanced DNS settings'), {
          panel: 'dns'
        }),
        entry('dns-custom-hosts', tr('Custom hosts'), tr('Advanced DNS settings'), {
          panel: 'dns'
        })
      ],
      content: () => <DNS embedded />
    },
    {
      key: 'network-behavior',
      label: tr('Network behavior'),
      entries: [
        entry('stop-core-offline', tr('Stop core when offline'), tr('Network behavior'), {
          panel: 'network-behavior'
        }),
        entry(
          'connectivity-check-interval',
          tr('Connectivity check interval'),
          tr('Network behavior'),
          { panel: 'network-behavior' }
        ),
        entry(
          'excluded-network-interfaces',
          tr('Interfaces excluded from detection'),
          tr('Network behavior'),
          { panel: 'network-behavior' }
        ),
        entry(
          'direct-wifi-ssids',
          tr('Use direct connections on specified Wi-Fi SSIDs'),
          tr('Network behavior'),
          { panel: 'network-behavior' }
        )
      ],
      content: () => <NetworkBehaviorSettings />
    },
    {
      key: 'sniffer',
      label: tr('Sniffing'),
      entries: [
        entry(
          'sniffer-override',
          tr('Override domain sniffing settings'),
          tr('Domain sniffing settings'),
          { panel: 'sniffer' }
        ),
        entry(
          'sniffer-override-address',
          tr('Override connection address'),
          tr('Sniffing behavior'),
          { panel: 'sniffer' }
        ),
        entry('sniffer-real-ip', tr('Sniff real IP mappings'), tr('Sniffing behavior'), {
          panel: 'sniffer'
        }),
        entry('sniffer-unmapped-ip', tr('Sniff unmapped IP addresses'), tr('Sniffing behavior'), {
          panel: 'sniffer'
        }),
        entry('sniffer-http-ports', tr('HTTP sniffing ports'), tr('Protocol ports'), {
          panel: 'sniffer'
        }),
        entry('sniffer-tls-ports', tr('TLS sniffing ports'), tr('Protocol ports'), {
          panel: 'sniffer'
        }),
        entry('sniffer-quic-ports', tr('QUIC sniffing ports'), tr('Protocol ports'), {
          panel: 'sniffer'
        }),
        entry('sniffer-skip-domain', tr('Skip domain sniffing'), tr('Sniffing exceptions'), {
          panel: 'sniffer'
        }),
        entry('sniffer-force-domain', tr('Force domain sniffing'), tr('Sniffing exceptions'), {
          panel: 'sniffer'
        }),
        entry(
          'sniffer-skip-destination',
          tr('Skip destination address sniffing'),
          tr('Sniffing exceptions'),
          { panel: 'sniffer' }
        ),
        entry(
          'sniffer-skip-source',
          tr('Skip source address sniffing'),
          tr('Sniffing exceptions'),
          { panel: 'sniffer' }
        )
      ],
      content: () => <Sniffer embedded />
    }
  ]

  const corePanels: SettingsPanelDefinition[] = [
    {
      key: 'runtime',
      label: tr('Core runtime'),
      entries: [
        entry('core-version', tr('Core version'), tr('Core runtime'), { panel: 'runtime' }),
        entry('system-core-path', tr('Choose system core path'), tr('Core runtime'), {
          panel: 'runtime'
        }),
        entry('core-process-priority', tr('Core process priority'), tr('Core runtime'), {
          panel: 'runtime'
        }),
        entry('core-run-mode', tr('Run mode'), tr('Core runtime'), { panel: 'runtime' }),
        entry('service-core-run-mode', tr('Service core execution mode'), tr('Core runtime'), {
          panel: 'runtime',
          platforms: ['linux']
        }),
        entry('startup-detection', tr('Startup detection method'), tr('Core runtime'), {
          panel: 'runtime',
          platforms: ['darwin', 'linux']
        })
      ],
      content: () => <CoreExecutionSettings />
    },
    {
      key: 'mihomo',
      label: 'Mihomo',
      entries: [
        entry('mihomo-ipv6', 'IPv6', tr('Core network'), { panel: 'mihomo' }),
        entry('mihomo-mixed-port', tr('Mixed port'), tr('Port settings'), { panel: 'mihomo' }),
        entry('mihomo-socks-port', tr('SOCKS port'), tr('Port settings'), { panel: 'mihomo' }),
        entry('mihomo-http-port', tr('HTTP port'), tr('Port settings'), { panel: 'mihomo' }),
        entry('mihomo-redir-port', tr('Redir port'), tr('Port settings'), { panel: 'mihomo' }),
        entry('mihomo-tproxy-port', tr('TProxy port'), tr('Port settings'), { panel: 'mihomo' }),
        entry('mihomo-allow-lan', tr('Allow LAN connections'), tr('Port settings'), {
          panel: 'mihomo'
        }),
        entry('mihomo-authentication', tr('User authentication'), tr('Port settings'), {
          panel: 'mihomo'
        }),
        entry('mihomo-controller', tr('Listen address'), tr('External controller'), {
          panel: 'mihomo'
        }),
        entry('mihomo-controller-key', tr('Access key'), tr('External controller'), {
          panel: 'mihomo'
        }),
        entry('mihomo-dashboard', tr('Enable controller dashboard'), tr('External controller'), {
          panel: 'mihomo'
        }),
        entry('mihomo-controller-cors', tr('CORS configuration'), tr('External controller'), {
          panel: 'mihomo'
        }),
        entry('mihomo-log-level', tr('Log level'), tr('Core logging'), { panel: 'mihomo' }),
        entry('mihomo-find-process', tr('Find process'), tr('Advanced settings'), {
          panel: 'mihomo'
        }),
        entry('mihomo-store-selected', tr('Remember selected proxies'), tr('Advanced settings'), {
          panel: 'mihomo'
        }),
        entry('mihomo-store-fake-ip', tr('Persist FakeIP mappings'), tr('Advanced settings'), {
          panel: 'mihomo'
        }),
        entry('mihomo-unified-delay', tr('Use RTT latency tests'), tr('Advanced settings'), {
          panel: 'mihomo'
        }),
        entry('mihomo-tcp-concurrent', tr('Concurrent TCP connections'), tr('Advanced settings'), {
          panel: 'mihomo'
        }),
        entry('mihomo-keep-alive', tr('Disable TCP keep-alive'), tr('Advanced settings'), {
          panel: 'mihomo'
        }),
        entry('mihomo-interface', tr('Set outbound interface'), tr('Advanced settings'), {
          panel: 'mihomo'
        })
      ],
      content: () => <Mihomo embedded />
    },
    {
      key: 'service',
      label: tr('Service management'),
      entries: [
        entry('elevation-status', tr('Elevation status'), tr('Service management'), {
          panel: 'service',
          platforms: ['win32', 'linux']
        }),
        entry('service-status', tr('Service status'), tr('Service management'), {
          panel: 'service'
        })
      ],
      content: () => <ServiceManagementSettings />
    },
    {
      key: 'environment',
      label: tr('Environment variables'),
      entries: [
        entry('disable-system-ca', tr('Disable system CAs'), tr('Environment variables'), {
          panel: 'environment'
        }),
        entry('disable-built-in-ca', tr('Disable built-in CAs'), tr('Environment variables'), {
          panel: 'environment'
        }),
        entry(
          'disable-loopback-detection',
          tr('Disable loopback detection'),
          tr('Environment variables'),
          { panel: 'environment' }
        ),
        entry('disable-nftables', tr('Disable nftables'), tr('Environment variables'), {
          panel: 'environment',
          platforms: ['linux']
        }),
        entry('trusted-path', tr('Trusted path'), tr('Environment variables'), {
          panel: 'environment'
        })
      ],
      content: () => <EnvSetting />
    }
  ]

  const dataPanels: SettingsPanelDefinition[] = [
    {
      key: 'subscriptions',
      label: tr('Subscription data'),
      entries: [
        entry(
          'separate-profile-workdir',
          tr('Use a separate working directory for each profile'),
          tr('Subscription data'),
          { panel: 'subscriptions' }
        ),
        entry('subscription-user-agent', tr('Subscription user agent'), tr('Subscription data'), {
          panel: 'subscriptions'
        })
      ],
      content: () => <SubscriptionDataSettings />
    },
    {
      key: 'backup',
      label: tr('Backup and restore'),
      entries: [
        entry('webdav-url', tr('WebDAV URL'), tr('WebDAV backup'), { panel: 'backup' }),
        entry('webdav-directory', tr('WebDAV backup directory'), tr('WebDAV backup'), {
          panel: 'backup'
        }),
        entry('webdav-username', tr('WebDAV username'), tr('WebDAV backup'), {
          panel: 'backup'
        }),
        entry('webdav-password', tr('WebDAV password'), tr('WebDAV backup'), {
          panel: 'backup'
        })
      ],
      content: () => <WebdavConfig />
    },
    {
      key: 'integrations',
      label: tr('Developer integration'),
      entries: [
        entry('github-token', 'GitHub API Token', tr('Developer integration'), {
          panel: 'integrations'
        }),
        entry(
          'copy-environment-format',
          tr('Copy environment variable format'),
          tr('Environment integration'),
          { panel: 'integrations' }
        ),
        entry(
          'gist-runtime-sync',
          tr('Sync runtime configuration to Gist'),
          tr('Gist synchronization'),
          { panel: 'integrations' }
        ),
        entry('gist-encryption', tr('Encrypt Gist configuration'), tr('Gist synchronization'), {
          panel: 'integrations'
        }),
        entry('gist-age-public-key', tr('Gist age public key'), tr('Gist synchronization'), {
          panel: 'integrations'
        }),
        entry('gist-age-private-key', tr('Gist age private key'), tr('Gist synchronization'), {
          panel: 'integrations'
        })
      ],
      content: () => (
        <>
          <IntegrationSettings />
          <GistIntegrationSettings />
        </>
      )
    },
    {
      key: 'geo-data',
      label: tr('Geo databases'),
      entries: [
        entry('geoip-dat-url', tr('GeoIP-DAT database'), tr('Database sources'), {
          panel: 'geo-data'
        }),
        entry('geoip-mmdb-url', tr('GeoIP-MMDB database'), tr('Database sources'), {
          panel: 'geo-data'
        }),
        entry('geosite-url', tr('GeoSite database'), tr('Database sources'), {
          panel: 'geo-data'
        }),
        entry('ip-asn-url', tr('IP-ASN database'), tr('Database sources'), {
          panel: 'geo-data'
        }),
        entry('geoip-mode', tr('GeoIP mode'), tr('Update behavior'), {
          panel: 'geo-data'
        }),
        entry('geo-auto-update', tr('Update databases automatically'), tr('Update behavior'), {
          panel: 'geo-data'
        }),
        entry('geo-update-interval', tr('Update interval (hours)'), tr('Update behavior'), {
          panel: 'geo-data'
        }),
        entry('geo-update-now', tr('Update databases'), tr('Update behavior'), {
          panel: 'geo-data'
        })
      ],
      content: () => <GeoDataSettings />
    }
  ]

  const diagnosticsPanels: SettingsPanelDefinition[] = [
    {
      key: 'logs',
      label: tr('Application logs'),
      entries: [
        entry('save-logs', tr('Save logs'), tr('Application logs'), { panel: 'logs' }),
        entry('log-retention-days', tr('Log retention days'), tr('Application logs'), {
          panel: 'logs'
        }),
        entry('log-size-limit', tr('Log file size limit'), tr('Application logs'), {
          panel: 'logs'
        }),
        entry('live-log-limit', tr('Live log entry limit'), tr('Application logs'), {
          panel: 'logs'
        })
      ],
      content: () => <LogSetting />
    },
    {
      key: 'maintenance',
      label: tr('Maintenance and diagnostics'),
      entries: [
        entry('guided-tour', tr('Open guided tour'), tr('Application actions'), {
          panel: 'maintenance'
        }),
        entry('check-updates', tr('Check for updates'), tr('Application actions'), {
          panel: 'maintenance'
        }),
        entry('clear-cache', tr('Clear cache'), tr('Diagnostics'), { panel: 'maintenance' }),
        entry('heap-snapshot', tr('Create heap snapshot'), tr('Diagnostics'), {
          panel: 'maintenance'
        })
      ],
      content: () => <Actions sections={['application', 'diagnostics']} />
    },
    {
      key: 'lifecycle',
      label: tr('Version information'),
      entries: [
        entry('app-version', tr('App version'), tr('Version information'), {
          panel: 'lifecycle'
        }),
        entry('reset-app', tr('Reset app'), tr('Danger zone'), { panel: 'lifecycle' }),
        entry('quit-keep-core', tr('Quit and keep core running'), tr('Danger zone'), {
          panel: 'lifecycle'
        }),
        entry('quit-app', tr('Quit app'), tr('Danger zone'), { panel: 'lifecycle' })
      ],
      content: () => <Actions sections={['version', 'danger']} showVersionHeading={false} />
    }
  ]

  return (
    [
      {
        key: 'general',
        label: tr('General'),
        icon: LuAppWindow,
        entries: [
          entry('interface-language', tr('Interface language'), tr('Language and notifications')),
          entry('notification-style', tr('Notification style'), tr('Language and notifications')),
          entry('launch-at-startup', tr('Launch at startup'), tr('Startup and updates')),
          entry('start-minimized', tr('Start minimized'), tr('Startup and updates')),
          entry(
            'automatic-update-checks',
            tr('Check for updates automatically'),
            tr('Startup and updates')
          ),
          entry('update-channel', tr('Update channel'), tr('Startup and updates')),
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
        label: tr('Appearance'),
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
        label: tr('Core'),
        icon: LuCpu,
        entries: corePanels.flatMap((panel) => panel.entries),
        panels: corePanels
      },
      {
        key: 'data',
        label: tr('Data'),
        icon: LuArchiveRestore,
        entries: dataPanels.flatMap((panel) => panel.entries),
        panels: dataPanels
      },
      {
        key: 'shortcuts',
        label: tr('Shortcuts'),
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
        label: tr('Diagnostics'),
        icon: LuWrench,
        entries: diagnosticsPanels.flatMap((panel) => panel.entries),
        panels: diagnosticsPanels
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
