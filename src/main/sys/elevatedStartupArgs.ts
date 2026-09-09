import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { isConfigUri } from '../../shared/product-identity'

export const WINDOWS_ELEVATED_TASK_ARGUMENT = '--kokorobox-elevated-task'
export const WINDOWS_ELEVATED_DEEP_LINKS_FILENAME = 'kokorobox-elevated-deep-links.json'

const MAX_DEEP_LINKS = 16
const MAX_DEEP_LINK_LENGTH = 8192
const MAX_FILE_SIZE = 64 * 1024
const MAX_AGE_MS = 5 * 60 * 1000

type ElevatedDeepLinks = {
  version: 1
  createdAt: number
  links: string[]
}

export function safeElevatedDeepLinks(argv: string[]): string[] {
  return argv
    .filter((value) => value.length <= MAX_DEEP_LINK_LENGTH && isConfigUri(value))
    .slice(0, MAX_DEEP_LINKS)
}

export function stageElevatedDeepLinks(filePath: string, argv: string[], now = Date.now()): void {
  const links = safeElevatedDeepLinks(argv)
  if (links.length === 0) {
    rmSync(filePath, { force: true })
    return
  }

  const temporaryPath = `${filePath}.${process.pid}.tmp`
  const payload: ElevatedDeepLinks = { version: 1, createdAt: now, links }
  try {
    writeFileSync(temporaryPath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 })
    rmSync(filePath, { force: true })
    renameSync(temporaryPath, filePath)
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}

export function takeElevatedDeepLinks(
  filePath: string,
  argv: string[],
  now = Date.now()
): string[] {
  if (!argv.includes(WINDOWS_ELEVATED_TASK_ARGUMENT)) return []

  try {
    if (statSync(filePath).size > MAX_FILE_SIZE) return []
    const payload = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<ElevatedDeepLinks>
    if (
      payload.version !== 1 ||
      typeof payload.createdAt !== 'number' ||
      payload.createdAt > now + 60_000 ||
      now - payload.createdAt > MAX_AGE_MS ||
      !Array.isArray(payload.links)
    ) {
      return []
    }
    if (
      payload.links.length > MAX_DEEP_LINKS ||
      payload.links.some(
        (value) =>
          typeof value !== 'string' || value.length > MAX_DEEP_LINK_LENGTH || !isConfigUri(value)
      )
    ) {
      return []
    }
    return payload.links
  } catch {
    return []
  } finally {
    rmSync(filePath, { force: true })
  }
}
