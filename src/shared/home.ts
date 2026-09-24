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

export type HomeBackgroundAlignment = 'left' | 'center' | 'right'

export type HomeNetworkCardBackground = 'none' | 'amamiya'

export function homeNetworkCardBackgroundChoice(value: unknown): HomeNetworkCardBackground {
  return value === 'amamiya' ? 'amamiya' : 'none'
}

export interface HomeBackground {
  file: string
  fit: 'cover' | 'contain'
  position: 'center' | 'top' | 'bottom' | 'left' | 'right'
  alignment?: HomeBackgroundAlignment
  scale?: boolean
  opacity: number
  blur: number
  overlay: number
}

export const homeDefaultBackgroundIds = ['ammy1', 'ammy2', 'ammy3'] as const

export type HomeDefaultBackgroundId = (typeof homeDefaultBackgroundIds)[number]

export interface HomeBackgroundAppearance {
  opacity: number
  blur: number
  overlay: number
  alignment?: HomeBackgroundAlignment
  scale?: boolean
}

export interface ResolvedHomeBackground extends HomeBackgroundAppearance {
  source: 'default' | 'custom' | 'none'
  imageUrl?: string
  fit: 'cover' | 'contain'
  position: string
  scale: boolean
  cardOpacity: number
}

export const defaultBuiltInBackgroundAppearance: HomeBackgroundAppearance = {
  opacity: 90,
  blur: 0,
  overlay: 10,
  alignment: 'right',
  scale: true
}

export const defaultHomeCardBackgroundOpacity = 68

export const defaultHomeBackgroundSettings = {
  fit: 'cover',
  position: 'center',
  alignment: 'center',
  scale: true,
  opacity: 90,
  blur: 0,
  overlay: 10
} as const satisfies Omit<HomeBackground, 'file'>

export function normalizeHomeDefaultBackgroundId(value: unknown): HomeDefaultBackgroundId {
  return homeDefaultBackgroundIds.find((id) => id === value) ?? homeDefaultBackgroundIds[0]
}

export function nextHomeDefaultBackgroundId(value: unknown): HomeDefaultBackgroundId {
  const currentIndex = homeDefaultBackgroundIds.indexOf(normalizeHomeDefaultBackgroundId(value))
  return homeDefaultBackgroundIds[(currentIndex + 1) % homeDefaultBackgroundIds.length]
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
  const legacyPosition = config?.homeBackground?.position
  const alignment =
    appearance?.alignment ??
    (source === 'custom' && (legacyPosition === 'left' || legacyPosition === 'right')
      ? legacyPosition
      : source === 'custom'
        ? 'center'
        : 'right')
  const verticalPosition =
    source === 'custom' && (legacyPosition === 'top' || legacyPosition === 'bottom')
      ? legacyPosition
      : source === 'custom'
        ? 'center'
        : 'bottom'
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
    position: `${alignment} ${verticalPosition}`,
    scale: appearance?.scale !== false,
    cardOpacity
  }
}

export function homeBackgroundChoice(
  config: Pick<AppConfig, 'homeBackground' | 'homeBackgroundDisabled'> | undefined
): 'default' | 'custom' | 'none' {
  if (config?.homeBackgroundDisabled) return 'none'
  if (config?.homeBackground?.file) return 'custom'
  return config?.homeBackgroundDisabled === false ? 'default' : 'none'
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
