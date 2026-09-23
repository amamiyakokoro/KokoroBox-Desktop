export function withConnectionSpeeds(
  current: ControllerConnectionDetail[],
  previous: ControllerConnectionDetail[] | undefined,
  sampleMs: number
): ControllerConnectionDetail[] {
  const previousById = new Map(previous?.map((connection) => [connection.id, connection]))
  const ratio = Number.isFinite(sampleMs) && sampleMs > 0 ? 1000 / sampleMs : 0
  return current.map((connection) => {
    const before = previousById.get(connection.id)
    return {
      ...connection,
      downloadSpeed: before
        ? Math.max(0, Math.round((connection.download - before.download) * ratio))
        : 0,
      uploadSpeed: before ? Math.max(0, Math.round((connection.upload - before.upload) * ratio)) : 0
    }
  })
}
