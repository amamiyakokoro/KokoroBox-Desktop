import { tr } from '../../../../../shared/i18n'
import { Switch } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import SettingItem from '@renderer/components/base/base-setting-item'
import FeatureSettingsLayout, {
  FeatureSettingsSaveButton,
  FeatureSettingsSection
} from '@renderer/components/base/base-feature-settings'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import PortSetting from '@renderer/components/mihomo/port-setting'
import ControllerSetting from '@renderer/components/mihomo/controller-setting'
import AdvancedSetting from '@renderer/components/mihomo/advanced-settings'
import CoreLogSetting from '@renderer/components/mihomo/core-log-setting'
import { mihomoUpgradeUI, restartCore, triggerSysProxy } from '@renderer/utils/ipc'
import React, { useCallback, useMemo, useState } from 'react'
import { mergeSettingsPatch } from '@renderer/utils/merge-settings-patch'
import { useSettingsSave } from '@renderer/hooks/use-settings-save'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { notify } from '@renderer/utils/notification'
import { useUnsavedChangesGuard } from '@renderer/hooks/use-unsaved-changes'

interface Props {
  embedded?: boolean
}

const Mihomo: React.FC<Props> = ({ embedded = false }) => {
  const { controledMihomoConfig, patchControledMihomoConfigOrThrow } = useControledMihomoConfig()
  const { appConfig } = useAppConfig()
  const { sysProxy, onlyActiveDevice = false } = appConfig || {}
  const [draftPatch, setDraftPatch] = useState<Partial<MihomoConfig>>({})
  const [validationErrors, setValidationErrors] = useState<Set<string>>(() => new Set())
  const { isSaving, runSave } = useSettingsSave()
  const values = useMemo(
    () => mergeSettingsPatch(controledMihomoConfig || {}, draftPatch),
    [controledMihomoConfig, draftPatch]
  )
  const { ipv6 } = values
  const isDirty = Object.keys(draftPatch).length > 0

  const stageChange = useCallback((patch: Partial<MihomoConfig>): void => {
    setDraftPatch((current) => mergeSettingsPatch(current, patch))
  }, [])

  const handleValidationChange = useCallback((key: string, invalid: boolean): void => {
    setValidationErrors((current) => {
      const next = new Set(current)
      if (invalid) next.add(key)
      else next.delete(key)
      if (next.size === current.size && [...next].every((item) => current.has(item))) return current
      return next
    })
  }, [])

  const saveChanges = async (): Promise<boolean> => {
    const patch = draftPatch
    const saved = await runSave(async () => {
      await patchControledMihomoConfigOrThrow(patch)
      await restartCore()
    })
    if (!saved) return false

    setDraftPatch({})
    if ('mixed-port' in patch && sysProxy?.enable) {
      try {
        await triggerSysProxy(true, onlyActiveDevice)
      } catch (error) {
        notify(error, { variant: 'danger' })
      }
    }
    if ('external-ui-url' in patch) {
      setTimeout(async () => {
        try {
          await mihomoUpgradeUI()
          notify(tr('Dashboard updated'), { variant: 'success' })
        } catch (error) {
          notify(error, { variant: 'danger' })
        }
      }, 1000)
    }
    return true
  }

  useUnsavedChangesGuard({
    id: 'mihomo-settings',
    label: tr('Mihomo settings'),
    isDirty,
    isSaving,
    canSave: validationErrors.size === 0,
    onSave: saveChanges,
    onDiscard: () => {
      setDraftPatch({})
      setValidationErrors(new Set())
    }
  })

  const saveButton = (
    <FeatureSettingsSaveButton
      isDirty={isDirty}
      isDisabled={validationErrors.size > 0}
      isSaving={isSaving}
      onPress={saveChanges}
    />
  )

  const content = (
    <>
      {embedded && (
        <div className="mx-auto flex w-full max-w-[1040px] justify-end px-3 pt-2">{saveButton}</div>
      )}
      <FeatureSettingsLayout>
        <FeatureSettingsSection title={tr('Core network')}>
          <SettingItem title="IPv6">
            <Switch
              size="sm"
              isSelected={ipv6}
              onValueChange={(value) => stageChange({ ipv6: value })}
            />
          </SettingItem>
        </FeatureSettingsSection>
        <PortSetting
          config={values}
          onChange={stageChange}
          onValidationChange={handleValidationChange}
        />
        <ControllerSetting
          config={values}
          onChange={stageChange}
          onValidationChange={handleValidationChange}
        />
        <CoreLogSetting config={values} onChange={stageChange} />
        <AdvancedSetting config={values} onChange={stageChange} />
      </FeatureSettingsLayout>
    </>
  )

  if (embedded) return content

  return (
    <BasePage title={tr('Mihomo settings')} contentClassName="no-scrollbar" header={saveButton}>
      {content}
    </BasePage>
  )
}

export default Mihomo
