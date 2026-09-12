import { tr } from '../../shared/i18n'
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { safeStorage } from 'electron'
import { kokoroAuthStorePath } from '../utils/dirs'

export interface KokoroCredentials {
  accessToken: string
  accessExpiresAt: number
  refreshToken: string
  refreshExpiresAt: number
}

interface KokoroAuthEnvelope {
  version: 1
  storage: 'electron-safe-storage'
  encrypted: string
}

function assertSecureStorageAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(tr('System secure storage is unavailable. Cannot save Kokoro credentials'))
  }

  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
    throw new Error(
      tr('The system keyring is unavailable. Cannot securely save Kokoro credentials')
    )
  }
}

function normalizeCredentials(value: Partial<KokoroCredentials>): KokoroCredentials {
  const accessToken = value.accessToken?.trim() || ''
  const refreshToken = value.refreshToken?.trim() || ''
  const accessExpiresAt = Number(value.accessExpiresAt)
  const refreshExpiresAt = Number(value.refreshExpiresAt)

  if (
    !accessToken ||
    !refreshToken ||
    !Number.isFinite(accessExpiresAt) ||
    !Number.isFinite(refreshExpiresAt)
  ) {
    throw new Error(tr('Invalid Kokoro credentials'))
  }

  return { accessToken, accessExpiresAt, refreshToken, refreshExpiresAt }
}

export async function loadKokoroCredentials(): Promise<KokoroCredentials | null> {
  let raw: string
  try {
    raw = await readFile(kokoroAuthStorePath(), 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  assertSecureStorageAvailable()
  let envelope: Partial<KokoroAuthEnvelope>
  try {
    envelope = JSON.parse(raw)
  } catch {
    throw new Error(tr('Invalid Kokoro credential storage format'))
  }
  if (
    !envelope ||
    envelope.version !== 1 ||
    envelope.storage !== 'electron-safe-storage' ||
    !envelope.encrypted
  ) {
    throw new Error(tr('Invalid Kokoro credential storage format'))
  }

  try {
    const decrypted = safeStorage.decryptString(Buffer.from(envelope.encrypted, 'base64'))
    return normalizeCredentials(JSON.parse(decrypted) as Partial<KokoroCredentials>)
  } catch {
    // JSON/crypto errors may contain decrypted input. Never send them to the renderer.
    throw new Error(tr('Invalid Kokoro credentials'))
  }
}

export async function saveKokoroCredentials(credentials: KokoroCredentials): Promise<void> {
  assertSecureStorageAvailable()
  const normalized = normalizeCredentials(credentials)
  const storePath = kokoroAuthStorePath()
  const tempPath = `${storePath}.tmp`
  const encrypted = safeStorage.encryptString(JSON.stringify(normalized)).toString('base64')
  const envelope: KokoroAuthEnvelope = {
    version: 1,
    storage: 'electron-safe-storage',
    encrypted
  }

  await mkdir(dirname(storePath), { recursive: true })
  try {
    await writeFile(tempPath, JSON.stringify(envelope), { encoding: 'utf-8', mode: 0o600 })
    await rename(tempPath, storePath)
  } catch (error) {
    await unlink(tempPath).catch(() => {})
    throw error
  }
}

export async function deleteKokoroCredentials(): Promise<void> {
  try {
    await unlink(kokoroAuthStorePath())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
