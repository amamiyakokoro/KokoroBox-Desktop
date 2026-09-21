let settingsSidebarPromise:
  Promise<typeof import('@renderer/components/settings/settings-sidebar')> | undefined

export const loadSettingsSidebar = (): Promise<
  typeof import('@renderer/components/settings/settings-sidebar')
> => {
  settingsSidebarPromise ??= import('@renderer/components/settings/settings-sidebar')
  return settingsSidebarPromise
}

export const preloadSettingsSidebar = (): Promise<unknown> => loadSettingsSidebar()
