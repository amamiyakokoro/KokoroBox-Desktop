interface FirewallResetActions {
  platform: NodeJS.Platform
  serviceMode: boolean
  repairService: () => Promise<void>
  repairDirect: () => void | Promise<void>
}

/** Service owns the staged executable; Desktop must never guess its hash path. */
export async function resetCoreFirewall(actions: FirewallResetActions): Promise<void> {
  if (actions.platform !== 'win32') return
  if (actions.serviceMode) {
    await actions.repairService()
    return
  }
  await actions.repairDirect()
}
