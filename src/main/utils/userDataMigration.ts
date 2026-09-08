import { existsSync, renameSync } from 'fs'
import path from 'path'
import { productIdentity } from '../../shared/product-identity'

export type UserDataMigrationResult =
  | { status: 'not-needed' | 'migrated' | 'already-migrated'; userDataPath: string }
  | { status: 'conflict' | 'failed'; userDataPath: string; legacyPath: string; error?: Error }

/**
 * Chooses the KokoroBox user-data directory before any configuration is read.
 *
 * A same-parent rename is atomic on all supported platforms.  If the target
 * already exists, or a rename cannot be completed, keep using the legacy
 * directory instead of risking a silent settings reset or a lossy merge.
 */
export function migrateUserDataDirectory(appDataPath: string): UserDataMigrationResult {
  const userDataPath = path.join(appDataPath, productIdentity.userDataDirectory)
  const legacyPath = path.join(appDataPath, productIdentity.legacyUserDataDirectories[0])

  if (!existsSync(legacyPath)) {
    return {
      status: existsSync(userDataPath) ? 'already-migrated' : 'not-needed',
      userDataPath
    }
  }

  if (existsSync(userDataPath)) {
    return { status: 'conflict', userDataPath: legacyPath, legacyPath }
  }

  try {
    renameSync(legacyPath, userDataPath)
    return { status: 'migrated', userDataPath }
  } catch (error) {
    return {
      status: 'failed',
      userDataPath: legacyPath,
      legacyPath,
      error: error instanceof Error ? error : new Error(String(error))
    }
  }
}
