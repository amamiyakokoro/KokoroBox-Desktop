export interface PublicIpInfo {
  ip: string
  countryCode?: string
  country?: string
  isp?: string
  asn?: string
}

export interface PublicIpSnapshot {
  info?: PublicIpInfo
  stale: boolean
}

export interface HomeBackground {
  file: string
  fit: 'cover' | 'contain'
  position: 'center' | 'top' | 'bottom' | 'left' | 'right'
  opacity: number
  blur: number
  overlay: number
}

export type HomeDefaultBackgroundId = 'ammy1' | 'ammy2'

export interface HomeBackgroundAppearance {
  opacity: number
  blur: number
  overlay: number
}

export interface ResolvedHomeBackground extends HomeBackgroundAppearance {
  source: 'default' | 'custom' | 'none'
  imageUrl?: string
  fit: 'cover' | 'contain'
  position: string
  cardOpacity: number
  networkOpacity: number
}

export const defaultBuiltInBackgroundAppearance: HomeBackgroundAppearance = {
  opacity: 90,
  blur: 0,
  overlay: 10
}

export const defaultHomeCardBackgroundOpacity = 68

export const defaultHomeBackgroundSettings = {
  fit: 'cover',
  position: 'center',
  opacity: 90,
  blur: 0,
  overlay: 10
} as const satisfies Omit<HomeBackground, 'file'>

export function normalizeHomeDefaultBackgroundId(value: unknown): HomeDefaultBackgroundId {
  return value === 'ammy2' ? 'ammy2' : 'ammy1'
}

export function nextHomeDefaultBackgroundId(value: unknown): HomeDefaultBackgroundId {
  return normalizeHomeDefaultBackgroundId(value) === 'ammy1' ? 'ammy2' : 'ammy1'
}

function boundedNumber(value: unknown, fallback: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, value))
    : fallback
}

export function resolveHomeBackground(
  config:
    | Pick<
        AppConfig,
        | 'homeBackground'
        | 'homeBackgroundDisabled'
        | 'homeDefaultBackgroundId'
        | 'homeDefaultBackgroundAppearance'
        | 'homeCardBackgroundOpacity'
      >
    | undefined,
  customImageUrl: string | undefined,
  builtInImages: Record<HomeDefaultBackgroundId, string>
): ResolvedHomeBackground {
  const source = homeBackgroundChoice(config)
  const appearance =
    source === 'custom' ? config?.homeBackground : config?.homeDefaultBackgroundAppearance
  const defaults =
    source === 'custom' ? defaultHomeBackgroundSettings : defaultBuiltInBackgroundAppearance
  const cardOpacity = boundedNumber(
    config?.homeCardBackgroundOpacity,
    source === 'custom' ? 82 : defaultHomeCardBackgroundOpacity,
    100
  )
  return {
    source,
    imageUrl:
      source === 'default'
        ? builtInImages[normalizeHomeDefaultBackgroundId(config?.homeDefaultBackgroundId)]
        : source === 'custom'
          ? customImageUrl
          : undefined,
    opacity: boundedNumber(appearance?.opacity, defaults.opacity, 100),
    blur: boundedNumber(appearance?.blur, defaults.blur, 20),
    overlay: boundedNumber(appearance?.overlay, defaults.overlay, 80),
    fit: source === 'custom' ? (config?.homeBackground?.fit ?? 'cover') : 'contain',
    position: source === 'custom' ? (config?.homeBackground?.position ?? 'center') : 'right bottom',
    cardOpacity,
    networkOpacity: Math.min(100, cardOpacity + 8)
  }
}

export function homeBackgroundChoice(
  config: Pick<AppConfig, 'homeBackground' | 'homeBackgroundDisabled'> | undefined
): 'default' | 'custom' | 'none' {
  if (config?.homeBackgroundDisabled) return 'none'
  return config?.homeBackground?.file ? 'custom' : 'default'
}

export function normalizeCountryCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const code = value.trim()
  return /^[a-zA-Z]{2}$/.test(code) ? code.toUpperCase() : undefined
}

export function countryFlagAssetKey(code: unknown): string | undefined {
  const normalized = normalizeCountryCode(code)
  return normalized ? `../../assets/circle-flags/${normalized.toLowerCase()}.svg` : undefined
}

export function maskPublicIp(ip: string): string {
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean)
    return `${parts.slice(0, 2).join(':') || '::'}:…`
  }
  const parts = ip.split('.')
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.**.${parts[3]}` : ip
}

export function displayServiceVersion(version: string | undefined): string | undefined {
  const value = version?.trim()
  if (!value || !/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) {
    return undefined
  }
  return `v${value.replace(/^v/, '')}`
}

export function isManagedHomeBackgroundFile(value: unknown): value is string {
  return typeof value === 'string' && /^home-background-[a-f0-9]{32}\.(?:png|jpg|webp)$/.test(value)
}

export function homeRuntimeState(
  coreRunning: boolean,
  corePermissionMode: AppConfig['corePermissionMode'],
  serviceStatus: string | undefined
): { mihomo: 'direct-run' | 'system-service' | 'stopped'; service: string | undefined } {
  return {
    mihomo: coreRunning
      ? corePermissionMode === 'service'
        ? 'system-service'
        : 'direct-run'
      : 'stopped',
    service: serviceStatus
  }
}
