function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function trimWrap(str: string): string {
  return str.startsWith('<') && str.endsWith('>') ? str.slice(1, -1) : str
}

function validateKeys(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const key of Object.keys(value)) {
    const normalized = trimWrap(key.replace(/^\+/, '').replace(/[!+]$/, ''))
    if (['__proto__', 'constructor', 'prototype'].includes(normalized)) {
      throw new Error(`Unsafe configuration key: ${key}`)
    }
    validateKeys((value as Record<string, unknown>)[key], seen)
  }
}

function merge(
  target: Record<string, unknown>,
  other: Record<string, unknown>,
  override: boolean
): void {
  for (const key of Object.keys(other)) {
    const value = other[key]
    if (isObject(value)) {
      const k = trimWrap(key.endsWith('!') ? key.slice(0, -1) : key)
      if (key.endsWith('!')) target[k] = value
      else {
        if (!Object.hasOwn(target, k) || !isObject(target[k])) target[k] = {}
        merge(target[k] as Record<string, unknown>, value, override)
      }
    } else if (Array.isArray(value)) {
      const prepend = override && key.startsWith('+')
      const append = override && key.endsWith('+')
      const k = trimWrap(prepend ? key.slice(1) : append ? key.slice(0, -1) : key)
      const existing = Object.hasOwn(target, k) && Array.isArray(target[k]) ? target[k] : []
      target[k] = prepend ? [...value, ...existing] : append ? [...existing, ...value] : value
    } else {
      Object.defineProperty(target, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true
      })
    }
  }
}

export function deepMerge<T extends object>(target: T, other: Partial<T>, isOverride = false): T {
  // Validate the complete input before changing the target, including replacement objects.
  validateKeys(other)
  merge(target as Record<string, unknown>, other as Record<string, unknown>, isOverride)
  return target
}
