import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { safeStorage } from 'electron'
import { dataDir } from '../utils/dirs'
import { getAppConfig, removeLegacyGitHubToken } from './app'

interface StoredToken {
  version: 1
  encrypted: string
}

const tokenPath = (): string => join(dataDir(), 'github-token.json')

function requireSecureStorage(): void {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text')
  ) {
    throw new Error('System secure storage is unavailable')
  }
}

async function readStoredToken(): Promise<string | null> {
  let contents: string
  try {
    contents = await readFile(tokenPath(), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  requireSecureStorage()
  try {
    const stored = JSON.parse(contents) as Partial<StoredToken>
    if (stored.version !== 1 || typeof stored.encrypted !== 'string' || !stored.encrypted) {
      throw new Error('Invalid token store')
    }
    return safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'))
  } catch {
    throw new Error('Invalid GitHub token storage')
  }
}

async function writeStoredToken(token: string): Promise<void> {
  requireSecureStorage()
  const target = tokenPath()
  const temporary = `${target}.tmp`
  const stored: StoredToken = {
    version: 1,
    encrypted: safeStorage.encryptString(token).toString('base64')
  }
  await mkdir(dirname(target), { recursive: true })
  try {
    await writeFile(temporary, JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 })
    if (process.platform !== 'win32') await chmod(temporary, 0o600)
    if (process.platform === 'win32')
      await unlink(target).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      })
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

let migrationPromise: Promise<string> | undefined
let migrationComplete = false

export async function getGitHubToken(): Promise<string> {
  migrationPromise ??= (async () => {
    const stored = await readStoredToken()
    const legacy = (await getAppConfig()).githubToken
    if (!migrationComplete) {
      if (legacy && stored === null) await writeStoredToken(legacy)
      await removeLegacyGitHubToken()
      migrationComplete = true
    }
    return stored ?? legacy ?? ''
  })().finally(() => {
    migrationPromise = undefined
  })
  return migrationPromise
}

export async function setGitHubToken(token: string): Promise<void> {
  await getGitHubToken()
  if (token.trim()) {
    await writeStoredToken(token.trim())
  } else {
    await unlink(tokenPath()).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    })
  }
}

export async function isGitHubTokenConfigured(): Promise<boolean> {
  return Boolean(await getGitHubToken())
}
