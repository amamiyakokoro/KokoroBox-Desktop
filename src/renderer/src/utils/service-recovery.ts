interface ServiceRecoveryActions {
  status: () => Promise<string>
  initialize: () => Promise<void>
  authenticate: () => Promise<boolean>
  reinstall: () => Promise<void>
}

function isUserCancelledError(error: unknown): boolean {
  return /UserCancelledError|User canceled|user cancelled|\(-128\)|(?:用户|用戶|使用者)已取消/i.test(
    String(error)
  )
}

/** Returns true only when reinstalling the service requires an app restart. */
export async function recoverServiceBeforeReinstall(
  actions: ServiceRecoveryActions
): Promise<boolean> {
  const status = await actions.status().catch(() => 'unknown')
  if (
    status === 'need-init' ||
    status === 'unknown' ||
    status === 'stopped' ||
    status === 'paused'
  ) {
    try {
      await actions.initialize()
      if (await actions.authenticate()) return false
    } catch (error) {
      if (isUserCancelledError(error)) throw error
    }
  }

  await actions.reinstall()
  return true
}
