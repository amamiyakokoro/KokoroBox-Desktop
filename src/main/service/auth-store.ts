import { tr } from '../../shared/i18n'
import { existsSync } from 'fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { serviceAuthStorePath } from '../utils/dirs'
import { validateKeyPair, type KeyPair } from './key'

interface PlainServiceAuthEnvelope extends ServiceAuthSecret {
  version: 2
  storage: 'plain'
}

type ServiceAuthEnvelope = PlainServiceAuthEnvelope

export interface ServiceAuthSecret extends KeyPair {}

function normalizeServiceAuthSecret(secret: {
  keyId?: string
  publicKey?: string
  privateKey?: string
}): ServiceAuthSecret {
  try {
    return validateKeyPair(
      secret.publicKey?.trim() || '',
      secret.privateKey?.trim() || '',
      secret.keyId
    )
  } catch {
    throw new Error(tr('Invalid service authentication key'))
  }
}

export async function loadServiceAuthSecret(): Promise<ServiceAuthSecret | null> {
  const storePath = serviceAuthStorePath()

  let raw: string
  try {
    raw = await readFile(storePath, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }

  const envelope = JSON.parse(raw) as Partial<ServiceAuthEnvelope>
  if (envelope.version === 2 && envelope.storage === 'plain') {
    return normalizeServiceAuthSecret(envelope)
  }

  throw new Error(tr('Invalid service authentication storage format'))
}

export async function saveServiceAuthSecret(secret: ServiceAuthSecret): Promise<void> {
  const normalizedSecret = normalizeServiceAuthSecret(secret)
  const storePath = serviceAuthStorePath()
  const tempPath = `${storePath}.tmp`
  const envelope: ServiceAuthEnvelope = {
    version: 2,
    storage: 'plain',
    ...normalizedSecret
  }
  const content = JSON.stringify(envelope, null, 2)

  await mkdir(dirname(storePath), { recursive: true })

  try {
    await writeFile(tempPath, content, { encoding: 'utf-8', mode: 0o600 })
    if (existsSync(storePath) && process.platform === 'win32') {
      await unlink(storePath)
    }
    await rename(tempPath, storePath)
  } catch (error) {
    try {
      await unlink(tempPath)
    } catch {
      // ignore
    }
    throw error
  }
}

export async function deleteServiceAuthSecret(): Promise<void> {
  try {
    await unlink(serviceAuthStorePath())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}
