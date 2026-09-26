export interface ServiceRepairState {
  repairing: boolean
  restartRequired: boolean
}

/** Session state outlives pages; a successful repair remains pending until app restart. */
export function createServiceRepairState(install: () => Promise<void>) {
  let snapshot: ServiceRepairState = { repairing: false, restartRequired: false }
  let operation: Promise<void> | undefined
  const listeners = new Set<() => void>()
  const update = (next: ServiceRepairState): void => {
    snapshot = next
    listeners.forEach((listener) => listener())
  }
  return {
    getSnapshot: (): ServiceRepairState => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    repair: (): Promise<void> => {
      if (operation) return operation
      if (snapshot.restartRequired) return Promise.resolve()
      operation = Promise.resolve()
        .then(install)
        .then(() => update({ repairing: true, restartRequired: true }))
        .finally(() => {
          operation = undefined
          update({ ...snapshot, repairing: false })
        })
      update({ ...snapshot, repairing: true })
      return operation
    }
  }
}
