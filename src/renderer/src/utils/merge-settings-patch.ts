const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

const mergeRecords = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> => {
  const result = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    result[key] =
      isPlainObject(value) && isPlainObject(result[key])
        ? mergeRecords(result[key] as Record<string, unknown>, value)
        : value
  }
  return result
}

export const mergeSettingsPatch = <T extends object>(base: T, patch: DeepPartial<T>): T =>
  mergeRecords(base as Record<string, unknown>, patch as Record<string, unknown>) as T
