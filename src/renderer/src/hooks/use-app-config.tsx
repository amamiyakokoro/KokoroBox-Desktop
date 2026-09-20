import React, { createContext, useContext, ReactNode } from 'react'
import useSWR from 'swr'
import { getAppConfig, patchAppConfig as patch } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'

interface AppConfigContextType {
  appConfig: AppConfig | undefined
  mutateAppConfig: () => void
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

  const patchAppConfig = async (value: Partial<AppConfig>): Promise<AppConfig | undefined> => {
    try {
      const nextConfig = await patch(value)
      mutateAppConfig(nextConfig, false)
      return nextConfig
    } catch (e) {
      notify(e, { variant: 'danger' })
      return undefined
    } finally {
      mutateAppConfig()
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

  return (
    <AppConfigContext.Provider value={{ appConfig, mutateAppConfig, patchAppConfig }}>
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
