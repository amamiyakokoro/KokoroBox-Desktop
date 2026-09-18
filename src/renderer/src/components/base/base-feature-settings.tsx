import { tr } from '../../../../shared/i18n'
import { Button } from '@heroui/react'
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

interface FeatureSettingsSaveButtonProps {
  isDirty: boolean
  isDisabled?: boolean
  isSaving?: boolean
  onPress: () => void | Promise<void>
}

export const FeatureSettingsSaveButton: React.FC<FeatureSettingsSaveButtonProps> = ({
  isDirty,
  isDisabled = false,
  isSaving = false,
  onPress
}) => (
  <Button
    size="sm"
    className="app-nodrag min-w-16"
    color={isDirty ? 'primary' : 'default'}
    variant={isDirty ? 'solid' : 'flat'}
    isDisabled={!isDirty || isDisabled || isSaving}
    isLoading={isSaving}
    aria-label={tr('Save')}
    onPress={onPress}
  >
    {tr('Save')}
  </Button>
)

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
