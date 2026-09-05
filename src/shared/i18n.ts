import { messages as zhTW } from './locales/zh-TW'

export type Locale = 'zh-CN' | 'zh-TW'
export type LanguagePreference = 'system' | Locale

export function resolveLocale(
  preference: unknown,
  systemLanguages: readonly string[] = []
): Locale {
  if (preference === 'zh-CN' || preference === 'zh-TW') return preference

  for (const language of systemLanguages) {
    const parts = language.toLowerCase().replaceAll('_', '-').split('-')
    if (parts[0] !== 'zh') continue
    if (parts.includes('hans')) return 'zh-CN'
    return parts.some((part) => ['hant', 'tw', 'hk', 'mo'].includes(part)) ? 'zh-TW' : 'zh-CN'
  }
  return 'zh-CN'
}

// The preload supplies the resolved locale before any renderer modules execute,
// including modules that create translated labels at import time.
const rendererAPI = (globalThis as { api?: { locale?: string } }).api
let currentLocale: Locale = resolveLocale(rendererAPI?.locale)

export function setLocale(locale: Locale): void {
  currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

/** Translate only application-owned messages; interpolation values remain untouched. */
export function tr(message: string, values: readonly unknown[] = []): string {
  const translated =
    currentLocale === 'zh-TW' && Object.hasOwn(zhTW, message) ? zhTW[message] : message
  return translated.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : placeholder
  )
}
