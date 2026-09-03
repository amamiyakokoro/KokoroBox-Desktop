import { existsSync } from 'fs'
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
    throw new Error('系统安全存储不可用，无法保存 Kokoro 登录凭据')
  }

  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
    throw new Error('系统密钥环不可用，无法安全保存 Kokoro 登录凭据')
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
    throw new Error('Kokoro 登录凭据无效')
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
  const envelope = JSON.parse(raw) as Partial<KokoroAuthEnvelope>
  if (
    envelope.version !== 1 ||
    envelope.storage !== 'electron-safe-storage' ||
    !envelope.encrypted
  ) {
    throw new Error('Kokoro 登录凭据存储格式无效')
  }

  const decrypted = safeStorage.decryptString(Buffer.from(envelope.encrypted, 'base64'))
  return normalizeCredentials(JSON.parse(decrypted) as Partial<KokoroCredentials>)
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
    if (existsSync(storePath) && process.platform === 'win32') await unlink(storePath)
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
