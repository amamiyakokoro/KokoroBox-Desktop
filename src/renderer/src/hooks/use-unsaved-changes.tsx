import { tr } from '../../../shared/i18n'
import ConfirmModal from '@renderer/components/base/base-confirm'
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'

interface UnsavedChangesGuard {
  id: string
  label: string
  isDirty: boolean
  isSaving?: boolean
  canSave?: boolean
  onSave: () => boolean | Promise<boolean>
  onDiscard?: () => void
}

type GuardGetter = () => UnsavedChangesGuard

interface PendingResolution {
  getGuard: GuardGetter
  resolve: (proceed: boolean) => void
}

interface UnsavedChangesContextValue {
  hasUnsavedChanges: boolean
  registerGuard: (id: string, getGuard: GuardGetter) => () => void
  refreshGuards: () => void
  confirmUnsavedChanges: () => Promise<boolean>
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

interface ProviderProps {
  children: ReactNode
}

export const UnsavedChangesProvider: React.FC<ProviderProps> = ({ children }) => {
  const guardsRef = useRef(new Map<string, GuardGetter>())
  const [revision, setRevision] = useState(0)
  const [pending, setPending] = useState<PendingResolution | null>(null)

  const refreshGuards = useCallback((): void => {
    setRevision((value) => value + 1)
  }, [])

  const registerGuard = useCallback(
    (id: string, getGuard: GuardGetter): (() => void) => {
      guardsRef.current.set(id, getGuard)
      refreshGuards()
      return () => {
        if (guardsRef.current.get(id) !== getGuard) return
        guardsRef.current.delete(id)
        refreshGuards()
      }
    },
    [refreshGuards]
  )

  const getDirtyGuard = useCallback((): GuardGetter | undefined => {
    return [...guardsRef.current.values()].find((getGuard) => getGuard().isDirty)
  }, [])

  const hasUnsavedChanges = useMemo(() => Boolean(getDirtyGuard()), [getDirtyGuard, revision])

  const resolvePending = useCallback((proceed: boolean): void => {
    setPending((current) => {
      if (!current) return null
      current.resolve(proceed)
      return null
    })
  }, [])

  const requestResolution = useCallback(
    (getGuard: GuardGetter, resolve: (proceed: boolean) => void): void => {
      setPending((current) => {
        if (current) {
          resolve(false)
          return current
        }
        return { getGuard, resolve }
      })
    },
    []
  )

  const confirmUnsavedChanges = useCallback((): Promise<boolean> => {
    const getGuard = getDirtyGuard()
    if (!getGuard) return Promise.resolve(true)
    return new Promise((resolve) => {
      requestResolution(getGuard, resolve)
    })
  }, [getDirtyGuard, requestResolution])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges &&
      `${currentLocation.pathname}${currentLocation.search}` !==
        `${nextLocation.pathname}${nextLocation.search}`
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const getGuard = getDirtyGuard()
    if (!getGuard) {
      blocker.proceed()
      return
    }
    requestResolution(getGuard, (proceed) => {
      if (proceed) blocker.proceed()
      else blocker.reset()
    })
  }, [blocker, getDirtyGuard, requestResolution])

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!hasUnsavedChanges) return
        event.preventDefault()
        event.returnValue = ''
      },
      [hasUnsavedChanges]
    )
  )

  const value = useMemo(
    () => ({ hasUnsavedChanges, registerGuard, refreshGuards, confirmUnsavedChanges }),
    [hasUnsavedChanges, registerGuard, refreshGuards, confirmUnsavedChanges]
  )

  const activeGuard = pending?.getGuard()

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      {pending && activeGuard && (
        <ConfirmModal
          title={tr('Unsaved changes')}
          description={tr('You have unsaved changes in {0}.', [activeGuard.label])}
          onChange={(open) => {
            if (!open) resolvePending(false)
          }}
          buttons={[
            {
              key: 'stay',
              text: tr('Keep editing'),
              variant: 'light',
              onPress: () => resolvePending(false)
            },
            {
              key: 'discard',
              text: tr('Discard changes'),
              color: 'danger',
              variant: 'light',
              onPress: () => {
                activeGuard.onDiscard?.()
                resolvePending(true)
              }
            },
            ...(activeGuard.canSave !== false
              ? [
                  {
                    key: 'save',
                    text: tr('Save changes'),
                    color: 'primary' as const,
                    onPress: async () => {
                      if (activeGuard.isSaving) return
                      const saved = await activeGuard.onSave()
                      resolvePending(saved)
                    }
                  }
                ]
              : [])
          ]}
        />
      )}
    </UnsavedChangesContext.Provider>
  )
}

export function useUnsavedChanges(): Pick<
  UnsavedChangesContextValue,
  'hasUnsavedChanges' | 'confirmUnsavedChanges'
> {
  const context = useContext(UnsavedChangesContext)
  if (!context) throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider')
  return context
}

export function useUnsavedChangesGuard(guard: UnsavedChangesGuard): void {
  const context = useContext(UnsavedChangesContext)
  if (!context) throw new Error('useUnsavedChangesGuard must be used within UnsavedChangesProvider')
  const { registerGuard, refreshGuards } = context

  const guardRef = useRef(guard)
  guardRef.current = guard

  useEffect(() => registerGuard(guard.id, () => guardRef.current), [registerGuard, guard.id])

  useEffect(() => {
    refreshGuards()
  }, [refreshGuards, guard.isDirty, guard.isSaving, guard.canSave])
}
