import { tr } from '../../../../shared/i18n'
import { Button, cn } from '@heroui/react'
import React, { type ReactNode } from 'react'
import { SettingCardModeProvider } from './base-setting-card'
import SettingsPanelAction from './base-settings-panel-action'
import SettingsSection from './base-settings-section'
import SettingsApplyNotice, { type SettingsApplyMode } from './base-settings-apply-notice'

interface FeatureSettingsLayoutProps {
  children: ReactNode
  className?: string
  applyMode?: SettingsApplyMode
  isDirty?: boolean
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

export const FeatureSettingsPanelAction: React.FC<{ action?: ReactNode }> = ({ action }) =>
  action ? <SettingsPanelAction>{action}</SettingsPanelAction> : null

export const FeatureSettingsSection: React.FC<FeatureSettingsSectionProps> = ({
  title,
  description,
  children
}) => (
  <SettingsSection
    className="feature-settings-section"
    contentClassName="feature-settings-section__content"
    description={description}
    title={title}
  >
    {children}
  </SettingsSection>
)

const FeatureSettingsLayout: React.FC<FeatureSettingsLayoutProps> = ({
  children,
  className,
  applyMode = 'save-restart-core',
  isDirty = false
}) => (
  <SettingCardModeProvider value={false}>
    <div
      className={cn('feature-settings-layout mx-auto w-full max-w-[960px] pb-4 pt-1', className)}
    >
      <SettingsApplyNotice mode={applyMode} isDirty={isDirty} />
      {children}
    </div>
  </SettingCardModeProvider>
)

export default FeatureSettingsLayout
