import { tr } from '../../../../shared/i18n'

export type SettingsApplyMode = 'save' | 'save-restart-core'

export default function SettingsApplyNotice({
  mode,
  isDirty = false
}: {
  mode: SettingsApplyMode
  isDirty?: boolean
}) {
  if (!isDirty) return null

  const descriptions: Record<SettingsApplyMode, string> = {
    save: tr('Save to apply changes to system proxy settings.'),
    'save-restart-core': tr(
      'Save to apply changes and restart the core. Connections may be interrupted.'
    )
  }

  return (
    <p role="status" className="px-3 pb-2 pt-3 text-xs leading-5 text-muted">
      {descriptions[mode]}
    </p>
  )
}
