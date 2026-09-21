import React, { createContext, type ReactNode, useContext } from 'react'
import { createPortal } from 'react-dom'

const SettingsPanelActionTargetContext = createContext<HTMLElement | null>(null)

interface SettingsPanelActionProviderProps {
  children: ReactNode
  target: HTMLElement | null
}

export const SettingsPanelActionProvider: React.FC<SettingsPanelActionProviderProps> = ({
  children,
  target
}) => (
  <SettingsPanelActionTargetContext.Provider value={target}>
    {children}
  </SettingsPanelActionTargetContext.Provider>
)

const SettingsPanelAction: React.FC<{ children: ReactNode }> = ({ children }) => {
  const target = useContext(SettingsPanelActionTargetContext)

  return target ? createPortal(children, target) : null
}

export default SettingsPanelAction
