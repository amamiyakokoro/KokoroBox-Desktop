import { tr } from '../../../shared/i18n'
import { mihomoRuleProviders, mihomoUpdateRuleProviders } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'

type RuleProvidersData = Awaited<ReturnType<typeof mihomoRuleProviders>>

export interface RuleProvidersModel {
  data: RuleProvidersData | undefined
  providers: ControllerRuleProviderDetail[]
  updating: Set<string>
  updatingAll: boolean
  onUpdate: (name: string) => Promise<void>
  updateAll: () => Promise<void>
}

export function useRuleProviders(enabled = true): RuleProvidersModel {
  const [updating, setUpdating] = useState<Set<string>>(() => new Set())
  const [updatingAll, setUpdatingAll] = useState(false)
  const { data, mutate } = useSWR(enabled ? 'mihomoRuleProviders' : null, mihomoRuleProviders, {
    errorRetryInterval: 200,
    errorRetryCount: 10
  })

  useEffect(() => {
    if (!enabled) return
    const unsubscribeCoreStarted = window.electron.ipcRenderer.on('core-started', () => {
      void mutate()
    })
    return (): void => {
      unsubscribeCoreStarted()
    }
  }, [enabled, mutate])

  const providers = useMemo(() => {
    if (!data) return []
    return Object.values(data.providers).sort((a, b) => {
      const order = { File: 1, Inline: 2, HTTP: 3 }
      return (order[a.vehicleType] || 4) - (order[b.vehicleType] || 4)
    })
  }, [data])

  const onUpdate = useCallback(
    async (name: string): Promise<void> => {
      setUpdating((prev) => {
        const next = new Set(prev)
        next.add(name)
        return next
      })
      try {
        await mihomoUpdateRuleProviders(name)
        await mutate()
      } catch (error) {
        notify(tr('Failed to update {0}\n{1}', [name, error]), { variant: 'danger' })
      } finally {
        setUpdating((prev) => {
          const next = new Set(prev)
          next.delete(name)
          return next
        })
      }
    },
    [mutate]
  )

  const updateAll = useCallback(async (): Promise<void> => {
    if (updatingAll || !providers.length) return
    setUpdatingAll(true)
    try {
      await Promise.all(providers.map((provider) => onUpdate(provider.name)))
    } finally {
      setUpdatingAll(false)
    }
  }, [onUpdate, providers, updatingAll])

  return { data, providers, updating, updatingAll, onUpdate, updateAll }
}
