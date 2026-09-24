export const maximumConnectionSampleGapMs = 30_000

export interface ConnectionCounterResetState {
  download: Set<string>
  upload: Set<string>
}

export function createConnectionCounterResetState(): ConnectionCounterResetState {
  return { download: new Set(), upload: new Set() }
}

function validCounter(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function counterRate(current: number, previous: number, sampleMs: number): number {
  if (!validCounter(current) || !validCounter(previous) || current < previous) return 0
  const rate = ((current - previous) * 1000) / sampleMs
  return Number.isFinite(rate) && rate > 0 ? rate : 0
}

export function withConnectionSpeeds(
  current: ControllerConnectionDetail[],
  previous: ControllerConnectionDetail[] | undefined,
  sampleMs: number,
  maximumGapMs = maximumConnectionSampleGapMs
): ControllerConnectionDetail[] {
  const previousById = new Map(previous?.map((connection) => [connection.id, connection]))
  const validSample =
    Number.isFinite(sampleMs) && sampleMs > 0 && sampleMs <= maximumGapMs && previous !== undefined
  const seenIds = new Set<string>()
  return current.flatMap((connection) => {
    if (!connection.id || seenIds.has(connection.id)) return []
    seenIds.add(connection.id)
    const before = validSample ? previousById.get(connection.id) : undefined
    const sameConnection = before && before.start === connection.start
    return [
      {
        ...connection,
        downloadSpeed: sameConnection
          ? counterRate(connection.download, before.download, sampleMs)
          : 0,
        uploadSpeed: sameConnection ? counterRate(connection.upload, before.upload, sampleMs) : 0
      }
    ]
  })
}

/** Ignore one lower out-of-order sample, then accept a persistent counter reset. */
export function nextConnectionCounterBaseline(
  current: ControllerConnectionDetail[],
  previous: ControllerConnectionDetail[] | undefined,
  resets: ConnectionCounterResetState
): ControllerConnectionDetail[] {
  const previousById = new Map(previous?.map((connection) => [connection.id, connection]))
  const seenIds = new Set<string>()
  const next = current.flatMap((connection) => {
    if (!connection.id || seenIds.has(connection.id)) return []
    seenIds.add(connection.id)
    const before = previousById.get(connection.id)
    if (!before || before.start !== connection.start) {
      resets.download.delete(connection.id)
      resets.upload.delete(connection.id)
      return [connection]
    }
    const nextCounter = (direction: 'download' | 'upload'): number => {
      const value = connection[direction]
      const previousValue = before[direction]
      const pending = resets[direction]
      if (!validCounter(value)) return validCounter(previousValue) ? previousValue : value
      if (!validCounter(previousValue) || value >= previousValue) {
        pending.delete(connection.id)
        return value
      }
      if (pending.has(connection.id)) {
        pending.delete(connection.id)
        return value
      }
      pending.add(connection.id)
      return previousValue
    }
    return [
      {
        ...connection,
        download: nextCounter('download'),
        upload: nextCounter('upload')
      }
    ]
  })
  for (const direction of ['download', 'upload'] as const) {
    for (const id of resets[direction]) {
      if (!seenIds.has(id)) resets[direction].delete(id)
    }
  }
  return next
}
