import { tr } from '../../../../shared/i18n'
import { Button } from '@heroui/react'
import React, { type ReactNode } from 'react'
import { SettingCardModeProvider } from './base-setting-card'
import SettingsSection from './base-settings-section'

interface FeatureSettingsLayoutProps {
  children: ReactNode
}

interface FeatureSettingsSectionProps {
  title: string
  description?: string
  action?: ReactNode
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
}) => {
  if (!isDirty) return null

  return (
    <Button
      size="sm"
      className="app-nodrag min-w-16"
      variant="primary"
      isDisabled={isDisabled || isSaving}
      isPending={isSaving}
      aria-label={tr('Save')}
      onPress={onPress}
    >
      {tr('Save')}
    </Button>
  )
}

export const FeatureSettingsSection: React.FC<FeatureSettingsSectionProps> = ({
  title,
  description,
  action,
  children
}) => (
  <SettingsSection
    action={action}
    className="feature-settings-section"
    contentClassName="feature-settings-section__content"
    description={description}
    title={title}
  >
    {children}
  </SettingsSection>
)

const FeatureSettingsLayout: React.FC<FeatureSettingsLayoutProps> = ({ children }) => (
  <SettingCardModeProvider value={false}>
    <div className="feature-settings-layout mx-auto w-full max-w-[960px] pb-4 pt-1">
      {children}
    </div>
  </SettingCardModeProvider>
)

export default FeatureSettingsLayout
