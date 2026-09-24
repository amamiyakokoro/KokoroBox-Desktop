import { isAppRoutingConnection } from '../components/connections/connection-identity'

export interface ActiveApplication {
  key: string
  name: string
  lookupPath: string
  kind: 'application' | 'process'
  downloadSpeed: number
  uploadSpeed: number
}

export type RememberedTopApplication = Pick<
  ActiveApplication,
  'key' | 'name' | 'lookupPath' | 'kind'
>

export const rememberedTopApplicationStorageKey = 'kokorobox:home:top-application:v1'

export function rememberTopApplication(application: ActiveApplication): RememberedTopApplication {
  const { key, name, lookupPath, kind } = application
  return { key, name, lookupPath, kind }
}

export function displayedTopApplication(
  current: ActiveApplication | undefined,
  remembered: RememberedTopApplication | undefined
): ActiveApplication | undefined {
  return current ?? (remembered ? { ...remembered, downloadSpeed: 0, uploadSpeed: 0 } : undefined)
}

export function parseRememberedTopApplication(
  value: string | null
): RememberedTopApplication | undefined {
  if (!value || value.length > 5000) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return undefined
    const item = parsed as Record<string, unknown>
    if (item.kind !== 'application' && item.kind !== 'process') return undefined
    if (
      typeof item.key !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.lookupPath !== 'string' ||
      !item.key.startsWith(`${item.kind}:`) ||
      item.key.length > 2100 ||
      !item.name.trim() ||
      item.name.length > 256 ||
      !item.lookupPath ||
      item.lookupPath.length > 2048 ||
      !/^(?:\/|[a-z]:[\\/]|\\\\)/i.test(item.lookupPath)
    ) {
      return undefined
    }
    return {
      key: item.key,
      name: item.name,
      lookupPath: item.lookupPath,
      kind: item.kind
    }
  } catch {
    return undefined
  }
}

export function connectionActivityFreshnessMs(connectionInterval: number): number {
  const interval =
    Number.isFinite(connectionInterval) && connectionInterval > 0 ? connectionInterval : 500
  return Math.max(5000, Math.min(30_000, interval * 3))
}

export function hasFreshConnectionActivity(
  sampledAt: number | undefined,
  sampleMs: number,
  now: number,
  connectionInterval: number
): boolean {
  return (
    sampledAt !== undefined &&
    Number.isFinite(sampleMs) &&
    sampleMs > 0 &&
    Number.isFinite(now) &&
    now >= sampledAt &&
    now - sampledAt < connectionActivityFreshnessMs(connectionInterval)
  )
}

const internalExecutables = new Set([
  'mihomo',
  'mihomo.exe',
  'kokorobox-process-router',
  'kokorobox-process-router.exe',
  'kokorobox-service',
  'kokorobox-service.exe'
])

function executableName(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/\.exe$/i, '') ?? ''
  )
}

/** An enclosing host bundle is identified by its own Contents directory. */
export function macosHostApplicationPath(executablePath: string): string | undefined {
  if (!executablePath.startsWith('/') || executablePath.includes('\0')) return undefined
  const segments = executablePath.split('/')
  if (segments.some((segment) => segment === '.' || segment === '..')) return undefined
  for (let index = 1; index < segments.length - 1; index += 1) {
    if (/\.app$/i.test(segments[index]) && segments[index + 1] === 'Contents') {
      return segments.slice(0, index + 1).join('/')
    }
  }
  return undefined
}

export function connectionApplicationIdentity(
  connection: ControllerConnectionDetail,
  platform: NodeJS.Platform
): Omit<ActiveApplication, 'downloadSpeed' | 'uploadSpeed'> | undefined {
  if (connection.metadata.type === 'Inner') return undefined
  const path = connection.metadata.processPath?.trim()
  if (!path || path.includes('\0')) return undefined
  const absolute = platform === 'win32' ? /^(?:[a-z]:[\\/]|\\\\)/i.test(path) : path.startsWith('/')
  if (!absolute) return undefined
  if (path.split(/[\\/]/).some((segment) => segment === '.' || segment === '..')) return undefined
  const executable = executableName(path)
  if (internalExecutables.has(executable.toLowerCase())) return undefined

  const hostPath = platform === 'darwin' ? macosHostApplicationPath(path) : undefined
  if (hostPath) {
    return {
      key: `application:${hostPath}`,
      name: executableName(hostPath).replace(/\.app$/i, ''),
      lookupPath: hostPath,
      kind: 'application'
    }
  }

  // A routing connection without an owning executable must not become a
  // generic "Application routing" or proxy-helper application on Home.
  if (isAppRoutingConnection(connection) && /^(?:helper|process.router)$/i.test(executable)) {
    return undefined
  }
  const name = connection.metadata.process?.trim() || executable
  if (!name || /^(?:helper|unknown|process.router)$/i.test(name)) return undefined
  return {
    key: `process:${platform === 'win32' ? path.toLowerCase() : path}`,
    name: name.replace(/\.exe$/i, ''),
    lookupPath: path,
    kind: 'process'
  }
}

function validRate(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function topActiveApplication(
  connections: ControllerConnectionDetail[] | undefined,
  platform: NodeJS.Platform
): ActiveApplication | undefined {
  if (!connections) return undefined
  const applications = new Map<string, ActiveApplication>()
  const seenConnectionIds = new Set<string>()
  for (const connection of connections) {
    if (!connection.id || seenConnectionIds.has(connection.id)) continue
    seenConnectionIds.add(connection.id)
    const identity = connectionApplicationIdentity(connection, platform)
    if (!identity) continue
    const downloadSpeed = validRate(connection.downloadSpeed)
    const uploadSpeed = validRate(connection.uploadSpeed)
    if (downloadSpeed + uploadSpeed <= 0) continue
    const existing = applications.get(identity.key)
    applications.set(identity.key, {
      ...identity,
      downloadSpeed: downloadSpeed + (existing?.downloadSpeed ?? 0),
      uploadSpeed: uploadSpeed + (existing?.uploadSpeed ?? 0)
    })
  }
  return [...applications.values()].sort(
    (left, right) =>
      right.downloadSpeed + right.uploadSpeed - left.downloadSpeed - left.uploadSpeed ||
      left.key.localeCompare(right.key)
  )[0]
}

export function activeRouteCount(connections: ControllerConnectionDetail[] | undefined): number {
  return new Set(connections?.map((connection) => connection.chains?.[0]?.trim()).filter(Boolean))
    .size
}
