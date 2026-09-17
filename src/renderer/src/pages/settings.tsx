import { tr } from '../../../shared/i18n'
import { Button } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
// import { CgWebsite } from 'react-icons/cg'
import { IoLogoGithub } from 'react-icons/io5'
import WebdavConfig from '@renderer/components/settings/webdav-config'
import GeneralConfig from '@renderer/components/settings/general-config'
import AdvancedSettings from '@renderer/components/settings/advanced-settings'
import Actions from '@renderer/components/settings/actions'
import ShortcutConfig from '@renderer/components/settings/shortcut-config'
import SiderConfig from '@renderer/components/settings/sider-config'
import AppearanceConfig from '@renderer/components/settings/appearance-confis'
import CoreRuntimeConfig from '@renderer/components/settings/core-runtime-config'
import LogSetting from '@renderer/components/mihomo/log-setting'
import EnvSetting from '@renderer/components/mihomo/env-setting'
import { SettingCardModeProvider } from '@renderer/components/base/base-setting-card'
import React, { useState } from 'react'
import {
  LuAppWindow,
  LuArchiveRestore,
  LuBrush,
  LuCommand,
  LuCpu,
  LuFileText,
  LuLayoutPanelLeft,
  LuSettings2,
  LuWrench
} from 'react-icons/lu'

type SettingsCategory =
  | 'general'
  | 'appearance'
  | 'sidebar'
  | 'core'
  | 'logs'
  | 'backup'
  | 'shortcuts'
  | 'advanced'
  | 'maintenance'

const categories: Array<{
  key: SettingsCategory
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { key: 'general', label: tr('General'), icon: LuAppWindow },
  { key: 'appearance', label: tr('Appearance'), icon: LuBrush },
  { key: 'sidebar', label: tr('Sidebar settings'), icon: LuLayoutPanelLeft },
  { key: 'core', label: tr('Core and service'), icon: LuCpu },
  { key: 'logs', label: tr('Log settings'), icon: LuFileText },
  { key: 'backup', label: tr('Backup and restore'), icon: LuArchiveRestore },
  { key: 'shortcuts', label: tr('Keyboard shortcuts'), icon: LuCommand },
  { key: 'advanced', label: tr('Advanced settings'), icon: LuSettings2 },
  { key: 'maintenance', label: tr('Maintenance and diagnostics'), icon: LuWrench }
]

const categoryContent: Record<SettingsCategory, React.ReactNode> = {
  general: <GeneralConfig />,
  appearance: <AppearanceConfig />,
  sidebar: <SiderConfig />,
  core: (
    <>
      <CoreRuntimeConfig />
      <EnvSetting />
    </>
  ),
  logs: <LogSetting />,
  backup: <WebdavConfig />,
  shortcuts: <ShortcutConfig />,
  advanced: <AdvancedSettings />,
  maintenance: <Actions />
}

const Settings: React.FC = () => {
  const [category, setCategory] = useState<SettingsCategory>('general')
  const selected = categories.find((item) => item.key === category) ?? categories[0]

  return (
    <BasePage
      title={tr('Application settings')}
      header={
        <>
          {/* <Button
            isIconOnly
            size="sm"
            variant="light"
            title="官方文档"
            className="app-nodrag"
            onPress={() => {
              window.open('https://')
            }}
          >
            <CgWebsite className="text-lg" />
          </Button> */}
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="app-nodrag"
            onPress={() => {
              window.open('https://github.com/amamiyakokoro/KokoroBox-Desktop')
            }}
          >
            <IoLogoGithub className="text-lg" />
          </Button>
        </>
      }
    >
      <div className="settings-layout min-h-full md:grid md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label={tr('Settings categories')}
          className="settings-navigation sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-divider bg-background/95 p-2 backdrop-blur md:top-auto md:h-[calc(100vh-49px)] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3"
        >
          {categories.map((item) => {
            const Icon = item.icon
            const active = category === item.key
            return (
              <Button
                key={item.key}
                size="sm"
                variant={active ? 'flat' : 'light'}
                color={active ? 'primary' : 'default'}
                className="app-nodrag shrink-0 justify-start px-3 md:w-full"
                startContent={<Icon className="text-base" />}
                onPress={() => setCategory(item.key)}
              >
                {item.label}
              </Button>
            )
          })}
        </nav>
        <main className="min-w-0 px-1 pb-8 md:px-4">
          <div className="px-3 pb-1 pt-5">
            <h1 className="text-xl font-semibold tracking-tight">{selected.label}</h1>
          </div>
          <SettingCardModeProvider value={false}>
            {categoryContent[category]}
          </SettingCardModeProvider>
        </main>
      </div>
    </BasePage>
  )
}

export default Settings
