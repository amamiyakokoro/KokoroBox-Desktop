import { tr } from '../../../../shared/i18n'

export type SettingsApplyMode = 'automatic' | 'restart-core' | 'save' | 'save-restart-core'

export default function SettingsApplyNotice({
  mode,
  isDirty = false
}: {
  mode: SettingsApplyMode
  isDirty?: boolean
}) {
  const descriptions: Record<SettingsApplyMode, string> = {
    automatic: tr('Changes are saved automatically, except fields with a Save button.'),
    'restart-core': tr('Changes are saved immediately and restart the core.'),
    save: tr('Save to apply changes to system proxy settings.'),
    'save-restart-core': tr(
      'Save to apply changes and restart the core. Connections may be interrupted.'
    )
  }

  return (
    <div className="px-3 pb-2 pt-3 text-xs leading-5 text-muted">
      <p>{descriptions[mode]}</p>
      <p role="status" aria-live="polite" className="empty:hidden font-medium text-accent">
        {isDirty ? tr('Unsaved changes') : ''}
      </p>
    </div>
  )
}
