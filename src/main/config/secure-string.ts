import { chmod, copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { safeStorage } from 'electron'
import { dataDir } from '../utils/dirs'

export type SecureStringName = 'github-token' | 'webdav-password'

interface StoredString {
  version: 1
  encrypted: string
}

function storePath(name: SecureStringName): string {
  return join(dataDir(), `${name}.json`)
}

function requireSecureStorage(): void {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text')
  ) {
    throw new Error('System secure storage is unavailable')
  }
}

export async function readSecureString(name: SecureStringName): Promise<string | null> {
  const target = storePath(name)
  let contents: string
  try {
    contents = await readFile(target, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    if (process.platform !== 'win32') return null
    try {
      contents = await readFile(`${target}.backup`, 'utf8')
    } catch (backupError) {
      if ((backupError as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw backupError
    }
  }
  requireSecureStorage()
  try {
    const stored = JSON.parse(contents) as Partial<StoredString>
    if (stored.version !== 1 || typeof stored.encrypted !== 'string' || !stored.encrypted) {
      throw new Error('Invalid secret store')
    }
    return safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'))
  } catch {
    throw new Error('Invalid secure credential storage')
  }
}

export async function writeSecureString(name: SecureStringName, value: string): Promise<void> {
  requireSecureStorage()
  const target = storePath(name)
  const temporary = `${target}.tmp`
  const backup = `${target}.backup`
  const stored: StoredString = {
    version: 1,
    encrypted: safeStorage.encryptString(value).toString('base64')
  }
  await mkdir(dirname(target), { recursive: true })
  let backupCreated = false
  try {
    await writeFile(temporary, JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 })
    if (process.platform !== 'win32') await chmod(temporary, 0o600)
    if (process.platform === 'win32') {
      try {
        await copyFile(target, backup)
        backupCreated = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await unlink(target).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      })
    }
    await rename(temporary, target)
    if (process.platform === 'win32') await unlink(backup).catch(() => {})
  } catch (error) {
    await unlink(temporary).catch(() => {})
    if (process.platform === 'win32' && backupCreated) {
      await rename(backup, target).catch(() => {})
    }
    throw error
  }
}

export async function deleteSecureString(name: SecureStringName): Promise<void> {
  for (const path of [storePath(name), `${storePath(name)}.backup`]) {
    await unlink(path).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    })
  }
}
