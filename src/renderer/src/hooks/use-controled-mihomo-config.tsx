import React, { createContext, useContext, ReactNode } from 'react'
import useSWR from 'swr'
import { getControledMihomoConfig, patchControledMihomoConfig as patch } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'

interface ControledMihomoConfigContextType {
  controledMihomoConfig: Partial<MihomoConfig> | undefined
  mutateControledMihomoConfig: () => void
  patchControledMihomoConfig: (value: Partial<MihomoConfig>) => Promise<void>
  patchControledMihomoConfigOrThrow: (value: Partial<MihomoConfig>) => Promise<void>
}

const ControledMihomoConfigContext = createContext<ControledMihomoConfigContextType | undefined>(
  undefined
)

export const ControledMihomoConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: controledMihomoConfig, mutate: mutateControledMihomoConfig } = useSWR(
    'getControledMihomoConfig',
    () => getControledMihomoConfig()
  )

  const patchControledMihomoConfig = async (value: Partial<MihomoConfig>): Promise<void> => {
    try {
      await patch(value)
    } catch (e) {
      notify(e, { variant: 'danger' })
    } finally {
      mutateControledMihomoConfig()
    }
  }

  const patchControledMihomoConfigOrThrow = async (value: Partial<MihomoConfig>): Promise<void> => {
    try {
      await patch(value)
    } finally {
      mutateControledMihomoConfig()
    }
  }

  React.useEffect(() => {
    window.electron.ipcRenderer.on('controledMihomoConfigUpdated', () => {
      mutateControledMihomoConfig()
    })
    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('controledMihomoConfigUpdated')
    }
  }, [])

  return (
    <ControledMihomoConfigContext.Provider
      value={{
        controledMihomoConfig,
        mutateControledMihomoConfig,
        patchControledMihomoConfig,
        patchControledMihomoConfigOrThrow
      }}
    >
      {children}
    </ControledMihomoConfigContext.Provider>
  )
}

export const useControledMihomoConfig = (): ControledMihomoConfigContextType => {
  const context = useContext(ControledMihomoConfigContext)
  if (context === undefined) {
    throw new Error('useControledMihomoConfig must be used within a ControledMihomoConfigProvider')
  }
  return context
}
