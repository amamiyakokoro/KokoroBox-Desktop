export function assertManagedId(id: unknown): asserts id is string {
  if (
    typeof id !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) ||
    id.endsWith('.') ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(id)
  ) {
    throw new Error('Invalid managed configuration ID')
  }
}

export function assertManagedConfig(config: unknown, kind: 'profile' | 'override'): void {
  if (
    !config ||
    typeof config !== 'object' ||
    !Array.isArray((config as { items?: unknown }).items)
  ) {
    throw new Error(`Invalid ${kind} configuration`)
  }
  const value = config as { items: Record<string, unknown>[]; current?: unknown }
  const ids = new Set<string>()
  for (const item of value.items) {
    if (!item || typeof item !== 'object') throw new Error(`Invalid ${kind} item`)
    assertManagedId(item.id)
    if (ids.has(item.id)) throw new Error(`Duplicate ${kind} ID`)
    ids.add(item.id)
    if (kind === 'profile' && item.override !== undefined) {
      if (!Array.isArray(item.override)) throw new Error('Invalid profile override IDs')
      item.override.forEach(assertManagedId)
    }
    if (kind === 'override' && !['js', 'yaml'].includes(item.ext as string)) {
      throw new Error('Invalid override extension')
    }
  }
  if (kind === 'profile' && value.current !== undefined) assertManagedId(value.current)
}
