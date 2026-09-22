export type UwpLoopbackAppCategory = 'user' | 'microsoft' | 'system'
export type UwpLoopbackPackageType = 'main' | 'framework' | 'resource' | 'optional'

export interface UwpLoopbackApp {
  id: string
  packageFamilyName: string
  packageFullName?: string
  displayName: string
  description?: string
  enabled: boolean
  category: UwpLoopbackAppCategory
  packageType?: UwpLoopbackPackageType
  framework: boolean
  resourcePackage: boolean
}

interface LegacyUwpLoopbackApp {
  sid?: unknown
  packageName?: unknown
}

const categories = new Set<UwpLoopbackAppCategory>(['user', 'microsoft', 'system'])
const packageTypes = new Set<UwpLoopbackPackageType>(['main', 'framework', 'resource', 'optional'])

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function booleanValue(value: unknown): boolean {
  return value === true
}

function displayName(value: unknown, packageFamilyName: string): string {
  const name = stringValue(value)
  if (!name || name.startsWith('@{') || name.startsWith('ms-resource:')) {
    return packageFamilyName
  }
  return name
}

function legacyCategory(
  packageFamilyName: string,
  framework: boolean,
  resourcePackage: boolean
): UwpLoopbackAppCategory {
  if (framework || resourcePackage) return 'system'

  // Compatibility for kokorobox-native 0.14.0. Newer native builds always
  // provide the multi-signal category, which takes precedence over this list.
  const packageName = packageFamilyName.toLowerCase()
  if (
    packageName.includes('windowsappruntime') ||
    packageName.includes('languageexperiencepack') ||
    packageName.includes('microsoft.ui.xaml') ||
    packageName.includes('microsoft.vclibs') ||
    packageName.includes('microsoft.net.native') ||
    packageName.includes('microsoft.directx')
  ) {
    return 'system'
  }
  return packageName.startsWith('microsoft.') ? 'microsoft' : 'user'
}

export function normalizeUwpLoopbackApp(value: unknown): UwpLoopbackApp | undefined {
  if (!value || typeof value !== 'object') return undefined

  const candidate = value as Partial<UwpLoopbackApp> & LegacyUwpLoopbackApp
  const id = stringValue(candidate.id) ?? stringValue(candidate.sid)
  const packageFamilyName =
    stringValue(candidate.packageFamilyName) ?? stringValue(candidate.packageName)
  if (!id || !packageFamilyName) return undefined

  const framework = booleanValue(candidate.framework)
  const resourcePackage = booleanValue(candidate.resourcePackage)
  const nativeCategory = stringValue(candidate.category)
  const nativePackageType = stringValue(candidate.packageType)

  return {
    id,
    packageFamilyName,
    packageFullName: stringValue(candidate.packageFullName),
    displayName: displayName(candidate.displayName, packageFamilyName),
    description: stringValue(candidate.description),
    enabled: booleanValue(candidate.enabled),
    category:
      nativeCategory && categories.has(nativeCategory as UwpLoopbackAppCategory)
        ? (nativeCategory as UwpLoopbackAppCategory)
        : legacyCategory(packageFamilyName, framework, resourcePackage),
    packageType:
      nativePackageType && packageTypes.has(nativePackageType as UwpLoopbackPackageType)
        ? (nativePackageType as UwpLoopbackPackageType)
        : undefined,
    framework,
    resourcePackage
  }
}

export function normalizeUwpLoopbackApps(values: unknown): UwpLoopbackApp[] {
  if (!Array.isArray(values)) return []
  return values.flatMap((value) => {
    const app = normalizeUwpLoopbackApp(value)
    return app ? [app] : []
  })
}
