import React, { type ReactNode } from 'react'
import { SettingItemModeProvider } from './base-setting-item'

interface FeatureSettingsLayoutProps {
  children: ReactNode
}

interface FeatureSettingsSectionProps {
  title: string
  description?: string
  children: ReactNode
}

export const FeatureSettingsSection: React.FC<FeatureSettingsSectionProps> = ({
  title,
  description,
  children
}) => (
  <section className="feature-settings-section px-3 py-4 first:pt-3">
    <header className="mb-2 px-1">
      <h2 className="text-sm font-semibold tracking-wide text-foreground-500">{title}</h2>
      {description && <p className="mt-1 text-xs leading-5 text-foreground-500">{description}</p>}
    </header>
    <div className="border-y border-divider px-1 py-2">{children}</div>
  </section>
)

const FeatureSettingsLayout: React.FC<FeatureSettingsLayoutProps> = ({ children }) => (
  <SettingItemModeProvider value={false}>
    <div className="feature-settings-layout mx-auto w-full max-w-[1040px] pb-8 pt-1">
      {children}
    </div>
  </SettingItemModeProvider>
)

export default FeatureSettingsLayout
