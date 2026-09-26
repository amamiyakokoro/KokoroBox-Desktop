import { useEffect, useState } from 'react'
import { Button } from '@heroui/react'
import { tr } from '../../../../shared/i18n'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { normalizeAccentColor } from '@renderer/utils/accent-color'
import { KokoTextField } from '../base/koko-form'
import SettingItem from '../base/base-setting-item'

export default function AccentColorSetting() {
  const { appConfig, patchAppConfig } = useAppConfig()
  const color = normalizeAccentColor(appConfig?.accentColor)
  const [draft, setDraft] = useState(color || '#006fee')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setDraft(color || '#006fee')
  }, [color])
  const save = async (value: string) => {
    if (saving) return
    setSaving(true)
    try {
      await patchAppConfig({ accentColor: value })
    } finally {
      setSaving(false)
    }
  }
  const presets = [
    { value: '#006fee', label: tr('Blue accent') },
    { value: '#7c3aed', label: tr('Purple accent') },
    { value: '#db2777', label: tr('Pink accent') },
    { value: '#dc2626', label: tr('Red accent') },
    { value: '#c2410c', label: tr('Orange accent') },
    { value: '#047857', label: tr('Green accent') }
  ]
  return (
    <SettingItem title={tr('Accent color')} divider>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label={tr('Accent color')}>
          {presets.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={color === value}
              disabled={saving}
              onClick={() => void save(value)}
              style={{ backgroundColor: value }}
              className="size-7 rounded-full border-2 border-white/60 shadow-sm outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-foreground focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
            />
          ))}
        </div>
        <input
          type="color"
          aria-label={tr('Custom accent color')}
          value={normalizeAccentColor(draft) || '#006fee'}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          className="size-8 cursor-pointer rounded border border-separator bg-transparent"
        />
        <KokoTextField
          aria-label={tr('Custom accent color')}
          value={draft}
          onChangeValue={setDraft}
          isDisabled={saving}
          isInvalid={!normalizeAccentColor(draft)}
          className="w-28"
          maxLength={7}
        />
        <Button
          size="sm"
          variant="secondary"
          isDisabled={
            saving || !normalizeAccentColor(draft) || normalizeAccentColor(draft) === color
          }
          onPress={() => void save(normalizeAccentColor(draft)!)}
        >
          {tr('Save')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          isDisabled={saving || !color}
          onPress={() => void save('')}
        >
          {tr('Restore defaults')}
        </Button>
      </div>
    </SettingItem>
  )
}
