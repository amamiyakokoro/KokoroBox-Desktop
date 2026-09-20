import { tr } from '../../../../shared/i18n'
import { Button } from '@heroui/react'
import React, { type ReactNode } from 'react'
import { SettingCardModeProvider } from './base-setting-card'

interface FeatureSettingsLayoutProps {
  children: ReactNode
  action?: ReactNode
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

export const FeatureSettingsSection: React.FC<FeatureSettingsSectionProps> = ({
  title,
  description,
  children
}) => (
  <section className="feature-settings-section px-3 py-1.5 first:pt-1.5">
    <header className="px-1 pb-1.5 pt-0.5">
      <h2 className="text-base font-semibold leading-6 text-foreground">{title}</h2>
      {description && <p className="mt-0.5 text-xs leading-4 text-foreground-500">{description}</p>}
    </header>
    <div className="feature-settings-section__content border-t border-divider px-1 py-0.5">
      {children}
    </div>
  </section>
)

const FeatureSettingsLayout: React.FC<FeatureSettingsLayoutProps> = ({ children, action }) => (
  <SettingCardModeProvider value={false}>
    <div
      className={`feature-settings-layout relative mx-auto w-full max-w-[960px] pb-4 pt-1 ${action ? 'feature-settings-layout--has-action' : ''}`}
    >
      {action && <div className="feature-settings-layout__action">{action}</div>}
      {children}
    </div>
  </SettingCardModeProvider>
)

export default FeatureSettingsLayout
