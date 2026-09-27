export interface ServiceRepairState {
  repairing: boolean
  restartRequired: boolean
}

/** Session state outlives pages; only a service reinstall remains pending until app restart. */
export function createServiceRepairState<Options = void>(
  recover: (options?: Options) => Promise<boolean>
) {
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
    repair: (options?: Options): Promise<void> => {
      if (operation) return operation
      if (snapshot.restartRequired) return Promise.resolve()
      operation = Promise.resolve()
        .then(() => recover(options))
        .then((restartRequired) => update({ repairing: true, restartRequired }))
        .finally(() => {
          operation = undefined
          update({ ...snapshot, repairing: false })
        })
      update({ ...snapshot, repairing: true })
      return operation
    }
  }
}
