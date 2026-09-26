interface ServiceHealthProbe {
  ping: () => Promise<unknown>
  authenticate: () => Promise<unknown>
  finalizeAuthentication: () => Promise<unknown>
  isAuthenticationError: (error: unknown) => boolean
}

/** An OS process probe alone cannot establish that the service is usable. */
export async function probeServiceHealth(
  probe: ServiceHealthProbe
): Promise<'running' | 'need-init' | 'unknown'> {
  try {
    await probe.ping()
    await probe.authenticate()
    await probe.finalizeAuthentication()
    return 'running'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      probe.isAuthenticationError(error) ||
      /EACCES|permission denied|access is denied/i.test(message)
    ) {
      return 'need-init'
    }
    return 'unknown'
  }
}
