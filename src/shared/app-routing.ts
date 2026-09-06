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
  rules: []
}

export function appRoutingSupported(platform: NodeJS.Platform, arch: string): boolean {
  return platform === 'win32' && arch === 'x64'
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

export function validateAppRoutingRule(rule: AppRoutingRule): void {
  if (!rule.id || rule.id.length > 128) throw new Error('Invalid application rule ID')
  if (!/^(?:[a-zA-Z]:\\|\\\\)[^\0]+\.exe$/i.test(rule.executablePath)) {
    throw new Error('Application routing requires an absolute Windows .exe path')
  }
  if (
    new TextEncoder().encode(rule.executablePath).length >= 1024 ||
    /[*?;,]/.test(rule.executablePath)
  ) {
    throw new Error('Application routing path is not supported by the native router')
  }
  const derivedName = executableName(rule.executablePath)
  if (derivedName.includes('*') || derivedName.includes('?')) {
    throw new Error('Application routing does not allow process wildcards')
  }
  if (!derivedName || derivedName.toLowerCase() !== rule.executableName.toLowerCase()) {
    throw new Error('Application rule process name does not match its executable path')
  }
  if (isProtectedAppRoutingProcess(derivedName)) {
    throw new Error(`${derivedName} cannot be intercepted`)
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
    config.failClosed !== true
  ) {
    throw new Error('Invalid application routing configuration')
  }
  if (!Array.isArray(config.rules) || config.rules.length > 256) {
    throw new Error('Application routing supports at most 256 rules')
  }
  const ids = new Set<string>()
  const executablePaths = new Set<string>()
  const priorities = new Set<number>()
  let totalPathBytes = 0
  for (const rule of config.rules) {
    validateAppRoutingRule(rule)
    const executablePath = rule.executablePath.toLowerCase()
    totalPathBytes += new TextEncoder().encode(rule.executablePath).length + 1
    if (ids.has(rule.id)) throw new Error('Application rule IDs must be unique')
    if (executablePaths.has(executablePath)) {
      throw new Error(`Only one rule can target ${rule.executablePath}`)
    }
    if (priorities.has(rule.priority)) throw new Error('Application rule priorities must be unique')
    ids.add(rule.id)
    executablePaths.add(executablePath)
    priorities.add(rule.priority)
  }
  if (totalPathBytes > 30000) throw new Error('Application routing paths are too large')
}

export function normalizeAppRoutingConfig(config: AppRoutingConfig): AppRoutingConfig {
  return {
    version: config.version,
    enabled: config.enabled,
    failClosed: config.failClosed,
    rules: [...config.rules]
      .sort(
        (a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER)
      )
      .map((rule, index) => ({
        id: rule.id,
        enabled: rule.enabled,
        priority: index + 1,
        executablePath: rule.executablePath,
        executableName: rule.executableName,
        protocol: rule.protocol,
        action: rule.action
      }))
  }
}

export function migrateAppRoutingConfig(value: unknown): AppRoutingConfig {
  if (!value || typeof value !== 'object') throw new Error('Invalid application routing data')
  const source = value as Record<string, unknown>
  if (!Array.isArray(source.rules)) throw new Error('Invalid application routing rules')
  const rules = source.rules.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid application routing rule')
    const rule = item as Record<string, unknown>
    return {
      id: rule.id,
      enabled: rule.enabled,
      priority: rule.priority || index + 1,
      executablePath: rule.executablePath,
      executableName: rule.executableName || rule.processName,
      protocol: rule.protocol,
      action: rule.action
    } as AppRoutingRule
  })
  const migrated = normalizeAppRoutingConfig({
    version: source.version as 1,
    enabled: source.enabled as boolean,
    failClosed: true,
    rules
  })
  validateAppRoutingConfig(migrated)
  return migrated
}
