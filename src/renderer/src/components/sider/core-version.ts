export function normalizeCoreVersion(version?: string): string | undefined {
  const normalized = version?.trim()
  if (!normalized) return undefined

  const semanticVersion = normalized.match(/(?:^|[^\d])v?(\d+\.\d+\.\d+)(?=$|[^\d.])/i)
  return semanticVersion ? `v${semanticVersion[1]}` : undefined
}
