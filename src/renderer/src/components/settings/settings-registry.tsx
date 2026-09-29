import type { ReactNode } from 'react'
import Actions from './actions'
import AboutSettings from './about-settings'
import AppearanceConfig from './appearance-confis'
import {
  BackgroundBehaviorSettings,
  IntegrationSettings,
  NetworkBehaviorSettings
} from './behavior-settings'
import { CoreExecutionSettings } from './core-runtime-config'
import GeneralConfig, { PerformanceConfig } from './general-config'
import GeoDataSettings from './geo-data-settings'
import ShortcutConfig from './shortcut-config'
import SiderConfig from './sider-config'
import {
  GistIntegrationSettings,
  SubscriptionDataSettings
} from './subscription-integration-settings'
import WebdavConfig from './webdav-config'
import EnvSetting from '../mihomo/env-setting'
import LogSetting from '../mihomo/log-setting'
import DNS from './network/dns-settings'
import Mihomo from './network/mihomo-settings'
import Sniffer from './network/sniffer-settings'
import Sysproxy from './network/system-proxy-settings'
import Tun from './network/tun-settings'
import {
  getSettingsSchema,
  type SettingsCategory,
  type SettingsCategorySchema,
  type SettingsPanelSchema
} from './settings-schema'

export type {
  SettingsCategory,
  SettingsCategorySchema,
  SettingsEntryDefinition,
  SettingsPanelSchema
} from './settings-schema'
export { findSettingsEntry, legacyCategoryAliases } from './settings-schema'

export interface SettingsPanelDefinition extends SettingsPanelSchema {
  content: () => ReactNode
}

export interface SettingsCategoryDefinition extends Omit<SettingsCategorySchema, 'panels'> {
  content?: () => ReactNode
  panels?: SettingsPanelDefinition[]
}

const categoryContent: Partial<Record<SettingsCategory, () => ReactNode>> = {
  general: () => (
    <>
      <GeneralConfig />
      <BackgroundBehaviorSettings />
    </>
  ),
  shortcuts: () => <ShortcutConfig />,
  about: () => <AboutSettings />
}

const panelContent: Partial<Record<SettingsCategory, Record<string, () => ReactNode>>> = {
  appearance: {
    interface: () => <AppearanceConfig sections={['interface']} />,
    'tray-floating': () => <AppearanceConfig sections={['tray']} />,
    sidebar: () => <SiderConfig />,
    performance: () => <PerformanceConfig />
  },
  network: {
    'system-proxy': () => <Sysproxy embedded />,
    tun: () => <Tun embedded />,
    dns: () => <DNS embedded />,
    'network-behavior': () => <NetworkBehaviorSettings />,
    sniffer: () => <Sniffer embedded />
  },
  core: {
    runtime: () => <CoreExecutionSettings />,
    mihomo: () => <Mihomo embedded />,
    environment: () => <EnvSetting />
  },
  data: {
    subscriptions: () => <SubscriptionDataSettings />,
    backup: () => <WebdavConfig />,
    integrations: () => (
      <>
        <IntegrationSettings />
        <GistIntegrationSettings />
      </>
    ),
    'geo-data': () => <GeoDataSettings />
  },
  diagnostics: {
    logs: () => <LogSetting />,
    maintenance: () => <Actions sections={['application', 'diagnostics']} />,
    lifecycle: () => <Actions sections={['danger']} showVersionHeading={false} />
  }
}

const resolvePanelContent = (
  category: SettingsCategory,
  panel: SettingsPanelSchema
): (() => ReactNode) => {
  const content = panelContent[category]?.[panel.key]
  if (!content) throw new Error(`Missing settings panel renderer: ${category}/${panel.key}`)
  return content
}

export const getSettingsCategories = (): SettingsCategoryDefinition[] =>
  getSettingsSchema().map((category) => ({
    ...category,
    content: categoryContent[category.key],
    panels: category.panels?.map((panel) => ({
      ...panel,
      content: resolvePanelContent(category.key, panel)
    }))
  }))
