import { useEffect, useRef, useState } from 'react'
import { createHomeBackgroundSwitch } from '../../../shared/home-background-switch'
import {
  homeBackgroundChoice,
  normalizeHomeDefaultBackgroundId,
  type HomeDefaultBackgroundId
} from '../../../shared/home'
import { homeBuiltInImages } from '../utils/home-background-assets'
import { patchAppConfig as persistAppConfig } from '../utils/ipc'
import { notify } from '../utils/notification'
import { useAppConfig } from './use-app-config'

async function preloadBuiltInImage(id: HomeDefaultBackgroundId): Promise<void> {
  const image = new Image()
  image.src = homeBuiltInImages[id]
  await image.decode()
}

export function useHomeDefaultBackgroundSwitch() {
  const { appConfig, mutateAppConfig } = useAppConfig()
  const mode = homeBackgroundChoice(appConfig)
  const configId = normalizeHomeDefaultBackgroundId(appConfig?.homeDefaultBackgroundId)
  const [selectedId, setSelectedId] = useState(configId)
  const selectedRef = useRef(configId)
  useEffect(() => {
    selectedRef.current = configId
    setSelectedId(configId)
  }, [configId])
  const stateRef = useRef({ mode, selectedId: configId })
  stateRef.current = { mode, selectedId: selectedRef.current }
  const mutateRef = useRef(mutateAppConfig)
  mutateRef.current = mutateAppConfig
  const [pending, setPending] = useState(false)
  const switcherRef = useRef<() => Promise<boolean>>(undefined)
  if (!switcherRef.current) {
    switcherRef.current = createHomeBackgroundSwitch(
      () => stateRef.current,
      preloadBuiltInImage,
      async (id) => {
        await persistAppConfig({ homeDefaultBackgroundId: id })
        selectedRef.current = id
        stateRef.current = { ...stateRef.current, selectedId: id }
        setSelectedId(id)
        mutateRef.current()
      }
    )
  }

  const switchSelectedBackground = async (): Promise<void> => {
    setPending(true)
    try {
      await switcherRef.current?.()
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  return { selectedId, isDefault: mode === 'default', pending, switchSelectedBackground }
}
