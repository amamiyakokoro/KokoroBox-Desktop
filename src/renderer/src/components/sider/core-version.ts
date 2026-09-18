export function normalizeCoreVersion(version?: string): string | undefined {
  const normalized = version?.trim()
  if (!normalized || !/\d/.test(normalized)) return undefined
  return normalized
}
