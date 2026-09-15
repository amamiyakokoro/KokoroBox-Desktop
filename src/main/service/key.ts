import { tr } from '../../shared/i18n'
import crypto from 'crypto'
import * as native from 'kokorobox-native'

export interface KeyPair {
  keyId: string
  publicKey: string
  privateKey: string
}

export interface ServiceIdentityInfo {
  keyId: string
  publicKey: string
  backend: string
}

interface NativeServiceIdentity {
  getInfo(): ServiceIdentityInfo
  sign(data: string): string
}

interface NativeIdentityAPI {
  openServiceIdentity(
    options: { service: string; account: string; linuxFallbackPath?: string },
    legacy?: KeyPair
  ): Promise<NativeServiceIdentity>
}

function invalidServiceAuthKey(): Error {
  return new Error(tr('Invalid service authentication key'))
}

function parsePublicKey(publicKey: string): {
  key: crypto.KeyObject
  der: Buffer
  encoded: string
} {
  try {
    const encoded = publicKey.replace(/\s/g, '')
    if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw invalidServiceAuthKey()
    }

    const der = Buffer.from(encoded, 'base64')
    if (der.toString('base64') !== encoded) {
      throw invalidServiceAuthKey()
    }

    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
    if (key.asymmetricKeyType !== 'ed25519') {
      throw invalidServiceAuthKey()
    }

    const canonicalDer = key.export({ format: 'der', type: 'spki' })
    return {
      key,
      der: canonicalDer,
      encoded: canonicalDer.toString('base64')
    }
  } catch {
    throw invalidServiceAuthKey()
  }
}

function parsePrivateKey(privateKey: string): { key: crypto.KeyObject; pem: string } {
  try {
    const key = crypto.createPrivateKey({ key: privateKey.trim(), format: 'pem' })
    if (key.asymmetricKeyType !== 'ed25519') {
      throw invalidServiceAuthKey()
    }

    return {
      key,
      pem: key.export({ format: 'pem', type: 'pkcs8' }).toString()
    }
  } catch {
    throw invalidServiceAuthKey()
  }
}

export function validateKeyPair(publicKey: string, privateKey: string, keyId?: string): KeyPair {
  try {
    const parsedPublicKey = parsePublicKey(publicKey)
    const parsedPrivateKey = parsePrivateKey(privateKey)
    const derivedPublicKey = crypto
      .createPublicKey(parsedPrivateKey.key)
      .export({ format: 'der', type: 'spki' })

    if (
      derivedPublicKey.length !== parsedPublicKey.der.length ||
      !crypto.timingSafeEqual(derivedPublicKey, parsedPublicKey.der)
    ) {
      throw invalidServiceAuthKey()
    }

    const computedKeyId = crypto.createHash('sha256').update(parsedPublicKey.der).digest('hex')
    const normalizedKeyId = keyId?.trim() || computedKeyId
    if (normalizedKeyId !== computedKeyId) {
      throw invalidServiceAuthKey()
    }

    return {
      keyId: normalizedKeyId,
      publicKey: parsedPublicKey.encoded,
      privateKey: parsedPrivateKey.pem
    }
  } catch {
    throw invalidServiceAuthKey()
  }
}

export class KeyManager {
  private identity: NativeServiceIdentity | null = null
  private info: ServiceIdentityInfo | null = null

  setIdentity(identity: NativeServiceIdentity): void {
    this.identity = identity
    this.info = identity.getInfo()
  }

  getKeyID(): string {
    if (!this.info) {
      throw new Error(tr('Key ID is not initialized'))
    }
    return this.info.keyId
  }

  getPublicKey(): string {
    if (!this.info) {
      throw new Error(tr('Public key is not initialized'))
    }
    return this.info.publicKey
  }

  getBackend(): string {
    if (!this.info) {
      throw new Error(tr('Key ID is not initialized'))
    }
    return this.info.backend
  }

  signData(data: string): string {
    if (!this.identity) {
      throw new Error(tr('Private key is not initialized'))
    }

    return this.identity.sign(data)
  }

  isInitialized(): boolean {
    return this.identity !== null && this.info !== null
  }

  clear(): void {
    this.identity = null
    this.info = null
  }
}

export async function openNativeServiceIdentity(
  linuxFallbackPath: string,
  legacy?: KeyPair
): Promise<NativeServiceIdentity> {
  const api = native as unknown as Partial<NativeIdentityAPI>
  if (!api.openServiceIdentity) {
    throw new Error('Installed kokorobox-native does not include secure service identity')
  }
  return await api.openServiceIdentity(
    {
      service: 'com.amamiyakokoro.KokoroBox',
      account: 'desktop-service-auth',
      linuxFallbackPath
    },
    legacy
  )
}

export function computeKeyId(publicKey: string): string {
  const { der } = parsePublicKey(publicKey)
  return crypto.createHash('sha256').update(der).digest('hex')
}

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  return validateKeyPair(publicKey.toString('base64'), privateKey)
}

export function signData(privateKey: string, data: string): string {
  try {
    const { key } = parsePrivateKey(privateKey)
    return crypto.sign(null, Buffer.from(data), key).toString('base64')
  } catch {
    throw invalidServiceAuthKey()
  }
}
