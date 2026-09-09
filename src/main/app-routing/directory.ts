import { readdir } from 'fs/promises'
import path from 'path'
import {
  isProtectedAppRoutingProcess,
  normalizeWindowsExecutablePath
} from '../../shared/app-routing'

export interface WindowsExecutableScanResult {
  executablePaths: string[]
  truncated: boolean
  unreadableDirectoryCount: number
}

/**
 * Recursively finds ordinary .exe files without following links or junctions.
 * The hard result limit keeps an accidentally broad selection responsive.
 */
export async function scanWindowsExecutableDirectory(
  rootDirectory: string,
  maximumResults = 512
): Promise<WindowsExecutableScanResult> {
  const pending = [rootDirectory]
  const executablePaths: string[] = []
  let unreadableDirectoryCount = 0
  let truncated = false

  while (pending.length > 0 && !truncated) {
    const directory = pending.pop()!
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (directory === rootDirectory) throw error
      unreadableDirectoryCount++
      continue
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))

    const subdirectories: string[] = []
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        subdirectories.push(entryPath)
        continue
      }
      if (
        !entry.isFile() ||
        path.extname(entry.name).toLowerCase() !== '.exe' ||
        isProtectedAppRoutingProcess(entry.name)
      ) {
        continue
      }
      if (executablePaths.length >= maximumResults) {
        truncated = true
        break
      }
      executablePaths.push(normalizeWindowsExecutablePath(entryPath))
    }
    // Reverse the stack insertion so folders are visited in display order.
    pending.push(...subdirectories.reverse())
  }

  return { executablePaths, truncated, unreadableDirectoryCount }
}
