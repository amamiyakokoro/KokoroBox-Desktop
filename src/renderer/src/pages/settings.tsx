import { tr } from '../../../shared/i18n'
import { Button, Input } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
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
import { SettingItemModeProvider } from '@renderer/components/base/base-setting-item'
import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  LuAppWindow,
  LuArchiveRestore,
  LuBrush,
  LuChevronRight,
  LuCommand,
  LuCpu,
  LuFileText,
  LuLayoutPanelLeft,
  LuSearch,
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

interface CategoryDefinition {
  key: SettingsCategory
  label: string
  icon: React.ComponentType<{ className?: string }>
  entries: string[]
}

const categories: CategoryDefinition[] = [
  {
    key: 'general',
    label: tr('General'),
    icon: LuAppWindow,
    entries: [
      tr('Interface language'),
      tr('Launch at startup'),
      tr('Start minimized'),
      tr('Check for updates automatically'),
      tr('Update channel'),
      tr('Notification style'),
      tr('Disable GPU acceleration'),
      tr('Reduce animations')
    ]
  },
  {
    key: 'appearance',
    label: tr('Appearance'),
    icon: LuBrush,
    entries: [
      tr('Show floating window'),
      tr('Disable tray icon'),
      tr('Custom tray icon'),
      tr('Show proxy details in tray menu'),
      tr('Show Dock icon'),
      tr('Use system title bar'),
      tr('Show update button'),
      tr('Background color'),
      tr('Theme')
    ]
  },
  {
    key: 'sidebar',
    label: tr('Sidebar settings'),
    icon: LuLayoutPanelLeft,
    entries: [tr('Sidebar settings'), tr('Side panel')]
  },
  {
    key: 'core',
    label: tr('Core and service'),
    icon: LuCpu,
    entries: [
      tr('Core version'),
      tr('Choose system core path'),
      tr('Core process priority'),
      tr('Run mode'),
      tr('Service core execution mode'),
      tr('Startup detection method'),
      tr('Elevation status'),
      tr('Service status'),
      tr('Trusted path')
    ]
  },
  {
    key: 'logs',
    label: tr('Log settings'),
    icon: LuFileText,
    entries: [
      tr('Save logs'),
      tr('Log retention days'),
      tr('Log file size limit'),
      tr('Live log entry limit')
    ]
  },
  {
    key: 'backup',
    label: tr('Backup and restore'),
    icon: LuArchiveRestore,
    entries: [
      tr('WebDAV backup'),
      tr('WebDAV URL'),
      tr('WebDAV backup directory'),
      tr('WebDAV username'),
      tr('WebDAV password')
    ]
  },
  {
    key: 'shortcuts',
    label: tr('Keyboard shortcuts'),
    icon: LuCommand,
    entries: [
      tr('Toggle window'),
      tr('Toggle floating window'),
      tr('Toggle system proxy'),
      tr('Toggle TUN mode'),
      tr('Switch to rule mode'),
      tr('Switch to global mode'),
      tr('Switch to direct mode'),
      tr('Restart app')
    ]
  },
  {
    key: 'advanced',
    label: tr('Advanced settings'),
    icon: LuSettings2,
    entries: [
      'GitHub API Token',
      tr('Automatic lightweight mode'),
      tr('Lightweight mode behavior'),
      tr('Copy environment variable format'),
      tr('Stop core when offline'),
      tr('Connectivity check interval'),
      tr('Interfaces excluded from detection'),
      tr('Use direct connections on specified Wi-Fi SSIDs')
    ]
  },
  {
    key: 'maintenance',
    label: tr('Maintenance and diagnostics'),
    icon: LuWrench,
    entries: [
      tr('Open guided tour'),
      tr('Check for updates'),
      tr('Clear cache'),
      tr('Create heap snapshot'),
      tr('Reset app'),
      tr('Quit and keep core running'),
      tr('Quit app'),
      tr('App version')
    ]
  }
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

const isSettingsCategory = (value: string | null): value is SettingsCategory =>
  categories.some((category) => category.key === value)

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const requestedCategory = searchParams.get('section')
  const category: SettingsCategory = isSettingsCategory(requestedCategory)
    ? requestedCategory
    : 'general'
  const selected = categories.find((item) => item.key === category) ?? categories[0]
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const searchResults = useMemo(
    () =>
      normalizedSearch
        ? categories.flatMap((item) =>
            item.entries
              .filter(
                (entry) =>
                  entry.toLocaleLowerCase().includes(normalizedSearch) ||
                  item.label.toLocaleLowerCase().includes(normalizedSearch)
              )
              .map((entry) => ({ category: item, entry }))
          )
        : [],
    [normalizedSearch]
  )

  const selectCategory = (nextCategory: SettingsCategory): void => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', nextCategory)
    setSearchParams(nextParams)
  }

  return (
    <BasePage
      title={tr('Application settings')}
      header={
        <Button
          isIconOnly
          size="sm"
          variant="light"
          className="app-nodrag"
          aria-label="GitHub"
          onPress={() => window.open('https://github.com/amamiyakokoro/KokoroBox-Desktop')}
        >
          <IoLogoGithub className="text-lg" />
        </Button>
      }
    >
      <div className="settings-layout grid min-h-full grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-label={tr('Settings categories')}
          className="settings-navigation sticky top-0 z-10 flex h-[calc(100vh-49px)] flex-col border-r border-divider bg-background/95 p-3 backdrop-blur"
        >
          <Input
            size="sm"
            isClearable
            value={search}
            aria-label={tr('Search settings')}
            placeholder={tr('Search settings')}
            startContent={<LuSearch className="shrink-0 text-foreground-400" />}
            className="mb-2 shrink-0"
            onValueChange={setSearch}
            onClear={() => setSearch('')}
          />
          <div className="flex flex-col gap-1 overflow-y-auto">
            {categories.map((item) => {
              const Icon = item.icon
              const active = category === item.key && !normalizedSearch
              return (
                <Button
                  key={item.key}
                  size="sm"
                  variant={active ? 'flat' : 'light'}
                  color={active ? 'primary' : 'default'}
                  className="app-nodrag w-full shrink-0 justify-start px-3"
                  startContent={<Icon className="text-base" />}
                  onPress={() => {
                    setSearch('')
                    selectCategory(item.key)
                  }}
                >
                  {item.label}
                </Button>
              )
            })}
          </div>
        </nav>
        <main className="min-w-0 px-4 pb-8">
          <div className="px-3 pb-1 pt-5">
            <h1 className="text-xl font-semibold tracking-tight">
              {normalizedSearch ? tr('Search settings') : selected.label}
            </h1>
          </div>
          {normalizedSearch ? (
            <div className="mx-3 mt-3 border-y border-divider">
              {searchResults.length ? (
                searchResults.map(({ category: resultCategory, entry }) => (
                  <button
                    key={`${resultCategory.key}-${entry}`}
                    type="button"
                    className="flex w-full items-center gap-3 border-b border-divider px-2 py-3 text-left transition-colors last:border-b-0 hover:bg-default-100 focus-visible:outline-2 focus-visible:outline-primary"
                    onClick={() => {
                      selectCategory(resultCategory.key)
                      setSearch('')
                    }}
                  >
                    <resultCategory.icon className="shrink-0 text-lg text-foreground-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{entry}</span>
                      <span className="block text-xs text-foreground-500">
                        {resultCategory.label}
                      </span>
                    </span>
                    <LuChevronRight className="shrink-0 text-foreground-400" />
                  </button>
                ))
              ) : (
                <div className="px-2 py-8 text-center text-sm text-foreground-500">
                  {tr('No settings found')}
                </div>
              )}
            </div>
          ) : (
            <SettingCardModeProvider value={false}>
              <SettingItemModeProvider value={false}>
                {categoryContent[category]}
              </SettingItemModeProvider>
            </SettingCardModeProvider>
          )}
        </main>
      </div>
    </BasePage>
  )
}

export default Settings
