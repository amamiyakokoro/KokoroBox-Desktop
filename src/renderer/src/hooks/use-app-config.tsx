import React, { createContext, useContext, ReactNode } from 'react'
import useSWR from 'swr'
import { getAppConfig, patchAppConfig as patch } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import { useTheme } from 'next-themes'
import { useAccentColor } from './use-accent-color'

interface AppConfigContextType {
  appConfig: AppConfig | undefined
  mutateAppConfig: () => void
  patchAppConfigOrThrow: (value: Partial<AppConfig>) => Promise<AppConfig>
  patchAppConfig: (value: Partial<AppConfig>) => Promise<AppConfig | undefined>
}

const AppConfigContext = createContext<AppConfigContextType | undefined>(undefined)

const syncReducedMotionPreference = (disableAnimation: boolean): void => {
  if (disableAnimation) {
    document.documentElement.dataset.reduceMotion = 'true'
    return
  }

  delete document.documentElement.dataset.reduceMotion
}

export const AppConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: appConfig, mutate: mutateAppConfig } = useSWR('getConfig', () => getAppConfig())
  const { setTheme } = useTheme()
  const appTheme = appConfig?.appTheme
  useAccentColor(appConfig?.accentColor)

  const patchAppConfigOrThrow = async (value: Partial<AppConfig>): Promise<AppConfig> => {
    try {
      const nextConfig = await patch(value)
      void mutateAppConfig(nextConfig, false)
      return nextConfig
    } finally {
      void mutateAppConfig()
    }
  }

  const patchAppConfig = async (value: Partial<AppConfig>): Promise<AppConfig | undefined> => {
    try {
      return await patchAppConfigOrThrow(value)
    } catch (e) {
      notify(e, { variant: 'danger' })
      return undefined
    }
  }

  React.useEffect(() => {
    window.electron.ipcRenderer.on('appConfigUpdated', () => {
      mutateAppConfig()
    })
    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('appConfigUpdated')
    }
  }, [])

  React.useEffect(() => {
    if (!appConfig) return
    syncReducedMotionPreference(appConfig.disableAnimation === true)
  }, [appConfig])

  React.useEffect(() => {
    if (!appTheme) return
    setTheme(appTheme)
  }, [appTheme, setTheme])

  return (
    <AppConfigContext.Provider
      value={{ appConfig, mutateAppConfig, patchAppConfig, patchAppConfigOrThrow }}
    >
      {children}
    </AppConfigContext.Provider>
  )
}

export const useAppConfig = (): AppConfigContextType => {
  const context = useContext(AppConfigContext)
  if (context === undefined) {
    throw new Error('useAppConfig must be used within an AppConfigProvider')
  }
  return context
}
