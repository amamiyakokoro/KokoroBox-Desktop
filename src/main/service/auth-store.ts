import { tr } from '../../shared/i18n'
import { readFile, unlink } from 'fs/promises'
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

export async function deleteServiceAuthSecret(): Promise<void> {
  try {
    await unlink(serviceAuthStorePath())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}
