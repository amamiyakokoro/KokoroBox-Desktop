const validActions = new Set<AppRoutingAction>(['proxy', 'direct', 'block'])
const validProtocols = new Set<AppRoutingProtocol>(['tcp', 'udp', 'both'])
const reservedProcessNames = new Set([
  'kokorobox.exe',
  'mihomo.exe',
  'mihomo-alpha.exe',
  'clash.exe',
  'clash-meta.exe',
  'mihomo-windows-amd64.exe',
  'proxybridge_cli.exe',
  'kokorobox-proxybridge.exe',
  'kokorobox-process-router.exe',
  'sparkle-service.exe',
  'crashpad_handler.exe',
  'elevate.exe'
])
const reservedMacSigningIdentifiers = Object.freeze([
  'com.amamiyakokoro.app',
  'com.amamiyakokoro.app.*',
  'mihomo',
  'mihomo-alpha'
])

export function isProtectedAppRoutingProcess(executableName: string): boolean {
  const normalized = executableName.toLowerCase()
  return (
    reservedProcessNames.has(normalized) ||
    /^kokorobox-desktop-windows-.*-setup\.exe$/.test(normalized)
  )
}

export const defaultAppRoutingConfig: AppRoutingConfig = {
  version: 1,
  enabled: false,
  failClosed: true,
  proxyUdpDns: true,
  defaultAction: 'proxy',
  defaultProtocol: 'both',
  diagnosticLogging: false,
  rules: []
}

export function appRoutingSupported(platform: NodeJS.Platform, arch: string): boolean {
  return (
    (platform === 'win32' && arch === 'x64') ||
    (platform === 'darwin' && (arch === 'x64' || arch === 'arm64'))
  )
}

export function executableName(executablePath: string): string {
  const normalized = executablePath.replaceAll('/', '\\')
  return normalized.slice(normalized.lastIndexOf('\\') + 1)
}

export function normalizeWindowsExecutablePath(executablePath: string): string {
  const normalized = executablePath.replaceAll('/', '\\')
  if (normalized.startsWith('\\\\?\\UNC\\')) return `\\\\${normalized.slice(8)}`
  if (normalized.startsWith('\\\\?\\')) return normalized.slice(4)
  return normalized
}

export function normalizeProcessPattern(processPattern: string): string {
  return processPattern.trim().replaceAll('/', '\\')
}

export function appRoutingIdentifierKind(rule: AppRoutingRule): AppRoutingIdentifierKind {
  return rule.identifierKind ?? 'windows-executable'
}

export function normalizeMacSigningIdentifier(identifier: string): string {
  return identifier.trim()
}

export function normalizeAppRoutingIdentifier(
  identifier: string,
  kind: AppRoutingIdentifierKind
): string {
  return kind === 'macos-signing-identifier'
    ? normalizeMacSigningIdentifier(identifier)
    : normalizeProcessPattern(identifier)
}

function wildcardPatternMatches(pattern: string, value: string): boolean {
  const expression = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${expression}$`, 'i').test(value)
}

export function isProtectedAppRoutingPattern(processPattern: string): boolean {
  const filenamePattern = executableName(normalizeProcessPattern(processPattern))
  return (
    [...reservedProcessNames].some((name) => wildcardPatternMatches(filenamePattern, name)) ||
    wildcardPatternMatches(filenamePattern, 'kokorobox-desktop-windows-2.0.0-x64-setup.exe')
  )
}

export function isProtectedMacSigningIdentifier(identifier: string): boolean {
  const normalized = normalizeMacSigningIdentifier(identifier)
  return reservedMacSigningIdentifiers.some(
    (reserved) =>
      wildcardPatternMatches(normalized, reserved.replace('*', 'helper')) ||
      wildcardPatternMatches(reserved, normalized)
  )
}

function containsInvalidProcessPatternCharacter(processPattern: string): boolean {
  return [...processPattern].some(
    (character) => character.charCodeAt(0) < 0x20 || '?;,"'.includes(character)
  )
}

export function validateAppRoutingRule(rule: AppRoutingRule): void {
  if (!rule.id || rule.id.length > 128) throw new Error('Invalid application rule ID')
  if (typeof rule.processPattern !== 'string') {
    throw new Error('Application routing requires one valid application identifier')
  }
  const kind = appRoutingIdentifierKind(rule)
  const processPattern = normalizeAppRoutingIdentifier(rule.processPattern, kind)
  if (kind === 'windows-executable') {
    if (
      !processPattern ||
      !processPattern.toLowerCase().endsWith('.exe') ||
      new TextEncoder().encode(processPattern).length >= 1024 ||
      containsInvalidProcessPatternCharacter(processPattern)
    ) {
      throw new Error('Application routing requires one valid .exe process pattern')
    }
    if (isProtectedAppRoutingPattern(processPattern)) {
      throw new Error(`${processPattern} cannot be intercepted`)
    }
    if (
      rule.sourcePath !== undefined &&
      !/^(?:[a-zA-Z]:\\|\\\\)[^\0]+\.exe$/i.test(rule.sourcePath)
    ) {
      throw new Error('Application routing icon source must be an absolute Windows .exe path')
    }
  } else {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\*[A-Za-z0-9._-]*)?$/.test(processPattern) ||
      processPattern === '*' ||
      new TextEncoder().encode(processPattern).length > 512
    ) {
      throw new Error('Application routing requires one valid macOS signing identifier')
    }
    if (isProtectedMacSigningIdentifier(processPattern)) {
      throw new Error(`${processPattern} cannot be intercepted`)
    }
    if (rule.sourcePath !== undefined && !/^\/[^\0]+\.app$/i.test(rule.sourcePath)) {
      throw new Error('Application routing icon source must be an absolute macOS .app path')
    }
  }
  if (!validActions.has(rule.action)) throw new Error('Invalid application routing action')
  if (!validProtocols.has(rule.protocol)) throw new Error('Invalid application routing protocol')
  if (typeof rule.enabled !== 'boolean') throw new Error('Invalid application rule state')
  if (!Number.isInteger(rule.priority) || rule.priority < 1 || rule.priority > 256) {
    throw new Error('Invalid application rule priority')
  }
}

export function validateAppRoutingConfig(config: AppRoutingConfig): void {
  if (
    !config ||
    config.version !== 1 ||
    typeof config.enabled !== 'boolean' ||
    config.failClosed !== true ||
    typeof config.proxyUdpDns !== 'boolean' ||
    !validActions.has(config.defaultAction) ||
    !validProtocols.has(config.defaultProtocol) ||
    typeof config.diagnosticLogging !== 'boolean'
  ) {
    throw new Error('Invalid application routing configuration')
  }
  if (!Array.isArray(config.rules) || config.rules.length > 256) {
    throw new Error('Application routing supports at most 256 rules')
  }
  const ids = new Set<string>()
  const processPatterns = new Set<string>()
  const priorities = new Set<number>()
  let totalPatternBytes = 0
  for (const rule of config.rules) {
    validateAppRoutingRule(rule)
    const identifier = normalizeAppRoutingIdentifier(
      rule.processPattern,
      appRoutingIdentifierKind(rule)
    ).toLowerCase()
    totalPatternBytes += new TextEncoder().encode(identifier).length + 1
    if (ids.has(rule.id)) throw new Error('Application rule IDs must be unique')
    if (processPatterns.has(identifier)) {
      throw new Error(`Only one rule can target ${rule.processPattern}`)
    }
    if (priorities.has(rule.priority)) throw new Error('Application rule priorities must be unique')
    ids.add(rule.id)
    processPatterns.add(identifier)
    priorities.add(rule.priority)
  }
  if (totalPatternBytes > 30000) throw new Error('Application routing patterns are too large')
}

export function normalizeAppRoutingConfig(config: AppRoutingConfig): AppRoutingConfig {
  return {
    version: 1,
    enabled: config.enabled,
    failClosed: config.failClosed,
    proxyUdpDns: config.proxyUdpDns,
    defaultAction: config.defaultAction,
    defaultProtocol: config.defaultProtocol,
    diagnosticLogging: config.diagnosticLogging,
    rules: [...config.rules]
      .sort(
        (a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER)
      )
      .map((rule, index) => ({
        id: rule.id,
        enabled: rule.enabled,
        priority: index + 1,
        processPattern: normalizeAppRoutingIdentifier(
          rule.processPattern,
          appRoutingIdentifierKind(rule)
        ),
        ...(rule.identifierKind ? { identifierKind: rule.identifierKind } : {}),
        ...(rule.sourcePath
          ? {
              sourcePath:
                appRoutingIdentifierKind(rule) === 'windows-executable'
                  ? normalizeWindowsExecutablePath(rule.sourcePath)
                  : rule.sourcePath
            }
          : {}),
        protocol: rule.protocol,
        action: rule.action
      }))
  }
}

export function parseAppRoutingConfig(value: unknown): AppRoutingConfig {
  if (!value || typeof value !== 'object') throw new Error('Invalid application routing data')
  const config = value as AppRoutingConfig
  validateAppRoutingConfig(config)
  const normalized = normalizeAppRoutingConfig(config)
  validateAppRoutingConfig(normalized)
  return normalized
}
