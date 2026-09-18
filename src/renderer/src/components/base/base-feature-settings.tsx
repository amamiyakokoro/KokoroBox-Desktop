import { tr } from '../../../../shared/i18n'
import { Button } from '@heroui/react'
import React, { type ReactNode } from 'react'
import { SettingCardModeProvider } from './base-setting-card'
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
  onPress: () => void | Promise<unknown>
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
  <section className="feature-settings-section px-3 py-2.5 first:pt-2">
    <header className="mb-1.5 px-1">
      <h2 className="text-sm font-semibold tracking-wide text-foreground-500">{title}</h2>
      {description && <p className="mt-0.5 text-xs leading-4 text-foreground-500">{description}</p>}
    </header>
    <div className="feature-settings-section__content border-y border-divider px-1 py-1">
      {children}
    </div>
  </section>
)

const FeatureSettingsLayout: React.FC<FeatureSettingsLayoutProps> = ({ children }) => (
  <SettingCardModeProvider value={false}>
    <SettingItemModeProvider value={false}>
      <div className="feature-settings-layout mx-auto w-full max-w-[1040px] pb-4 pt-1">
        {children}
      </div>
    </SettingItemModeProvider>
  </SettingCardModeProvider>
)

export default FeatureSettingsLayout
