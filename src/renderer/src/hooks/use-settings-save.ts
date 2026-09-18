import { useCallback, useRef, useState } from 'react'
import { notify } from '@renderer/utils/notification'

interface SettingsSaveState {
  isSaving: boolean
  runSave: (action: () => void | Promise<void>) => Promise<boolean>
}

export const useSettingsSave = (): SettingsSaveState => {
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)

  const runSave = useCallback(async (action: () => void | Promise<void>): Promise<boolean> => {
    if (savingRef.current) return false

    savingRef.current = true
    setIsSaving(true)
    try {
      await action()
      return true
    } catch (error) {
      notify(error, { variant: 'danger' })
      return false
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }, [])

  return { isSaving, runSave }
}
