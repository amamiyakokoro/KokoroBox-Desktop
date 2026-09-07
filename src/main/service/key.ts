import { tr } from '../../shared/i18n'
import crypto from 'crypto'

export interface KeyPair {
  keyId: string
  publicKey: string
  privateKey: string
}

function invalidServiceAuthKey(): Error {
  return new Error(tr('服务鉴权密钥无效'))
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
  private keyId: string | null = null
  private publicKey: string | null = null
  private privateKey: string | null = null

  generateKeyPair(): KeyPair {
    const { publicKey: pubKeyObject, privateKey: privKeyPem } = crypto.generateKeyPairSync(
      'ed25519',
      {
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      }
    )

    const pubKeyPem = pubKeyObject as string
    const publicKey = pubKeyPem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/[\n\r\s]/g, '')

    const keyPair = validateKeyPair(publicKey, privKeyPem)
    this.keyId = keyPair.keyId
    this.publicKey = keyPair.publicKey
    this.privateKey = keyPair.privateKey

    return keyPair
  }

  setKeyPair(publicKey: string, privateKey: string, keyId?: string): void {
    const keyPair = validateKeyPair(publicKey, privateKey, keyId)
    this.keyId = keyPair.keyId
    this.publicKey = keyPair.publicKey
    this.privateKey = keyPair.privateKey
  }

  getKeyID(): string {
    if (!this.keyId) {
      throw new Error(tr('密钥 ID 未初始化'))
    }
    return this.keyId
  }

  getPublicKey(): string {
    if (!this.publicKey) {
      throw new Error(tr('公钥未初始化'))
    }
    return this.publicKey
  }

  getPrivateKey(): string {
    if (!this.privateKey) {
      throw new Error(tr('私钥未初始化'))
    }
    return this.privateKey
  }

  signData(data: string): string {
    if (!this.privateKey) {
      throw new Error(tr('私钥未初始化'))
    }

    return signData(this.privateKey, data)
  }

  isInitialized(): boolean {
    return (
      this.keyId !== null &&
      this.publicKey !== null &&
      this.privateKey !== null &&
      this.publicKey.trim() !== '' &&
      this.privateKey.trim() !== ''
    )
  }

  clear(): void {
    this.keyId = null
    this.publicKey = null
    this.privateKey = null
  }
}

export function computeKeyId(publicKey: string): string {
  const { der } = parsePublicKey(publicKey)
  return crypto.createHash('sha256').update(der).digest('hex')
}

export function generateKeyPair(): KeyPair {
  const manager = new KeyManager()
  return manager.generateKeyPair()
}

export function signData(privateKey: string, data: string): string {
  try {
    const { key } = parsePrivateKey(privateKey)
    return crypto.sign(null, Buffer.from(data), key).toString('base64')
  } catch {
    throw invalidServiceAuthKey()
  }
}
