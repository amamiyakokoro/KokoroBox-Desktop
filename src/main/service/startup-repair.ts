interface StartupRepairActions {
  probe: () => Promise<unknown>
  repair: () => Promise<void>
}

export function isUninitializedServiceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  // A generic 503, transport error or an unregistered client is not proof that
  // the service has lost its initialization. Leave those to existing recovery.
  return (
    /\bservice is not initialized\b/i.test(error.message) ||
    /服务未初始化|服務未初始化/.test(error.message)
  )
}

/** At most one elevated initialization attempt per app session, shared by callers. */
export function createServiceStartupRepair(actions: StartupRepairActions): () => Promise<void> {
  let repairAttempt: Promise<void> | undefined
  return async () => {
    try {
      await actions.probe()
      return
    } catch (error) {
      if (!isUninitializedServiceError(error)) return
    }
    // Retain failures too: cancellation must not trigger another automatic UAC prompt.
    repairAttempt ??= Promise.resolve().then(actions.repair)
    await repairAttempt
    await actions.probe()
  }
}
