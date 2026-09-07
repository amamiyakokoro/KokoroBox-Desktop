import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  KeyManager,
  computeKeyId,
  generateKeyPair,
  signData,
  validateKeyPair
} from '../src/main/service/key'

function publicKeyObject(publicKey: string): crypto.KeyObject {
  return crypto.createPublicKey({
    key: Buffer.from(publicKey, 'base64'),
    format: 'der',
    type: 'spki'
  })
}

function assertSafeInvalidKeyError(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, '服务鉴权密钥无效')
    assert.doesNotMatch(error.message, /PEM|OPENSSL|NO_START_LINE/i)
    return true
  })
}

test('generated service authentication keys are valid matching Ed25519 pairs', () => {
  const keyPair = generateKeyPair()
  const normalized = validateKeyPair(keyPair.publicKey, keyPair.privateKey, keyPair.keyId)
  const payload = 'service-auth-test'
  const signature = Buffer.from(signData(normalized.privateKey, payload), 'base64')

  assert.equal(normalized.keyId, computeKeyId(normalized.publicKey))
  assert.equal(
    crypto.verify(null, Buffer.from(payload), publicKeyObject(normalized.publicKey), signature),
    true
  )
})

test('each generated service authentication key pair is unique', () => {
  const first = generateKeyPair()
  const second = generateKeyPair()

  assert.notEqual(first.keyId, second.keyId)
  assert.notEqual(first.publicKey, second.publicKey)
  assert.notEqual(first.privateKey, second.privateKey)
})

test('invalid PEM is rejected before request signing without exposing OpenSSL details', () => {
  const keyPair = generateKeyPair()
  const manager = new KeyManager()

  assertSafeInvalidKeyError(() => manager.setKeyPair(keyPair.publicKey, 'not-a-pem'))
  assertSafeInvalidKeyError(() => signData('not-a-pem', 'payload'))
  assert.equal(manager.isInitialized(), false)
})

test('mismatched public and private service keys are rejected', () => {
  const first = generateKeyPair()
  const second = generateKeyPair()

  assertSafeInvalidKeyError(() => validateKeyPair(first.publicKey, second.privateKey))
  assertSafeInvalidKeyError(() => validateKeyPair(first.publicKey, first.privateKey, second.keyId))
})

test('malformed and non-Ed25519 public keys are rejected', () => {
  const rsa = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })

  assertSafeInvalidKeyError(() => computeKeyId('not-base64'))
  assertSafeInvalidKeyError(() => computeKeyId(rsa.publicKey.toString('base64')))
})

test('startup persists a replacement pair when stored authentication is unavailable', () => {
  const managerSource = readFileSync(resolve('src/main/service/manager.ts'), 'utf8')
  const storeSource = readFileSync(resolve('src/main/service/auth-store.ts'), 'utf8')
  const routingSource = readFileSync(resolve('src/main/app-routing/manager.ts'), 'utf8')

  assert.match(
    managerSource,
    /const nextKeyManager = new KeyManager\(\)[\s\S]*await ensurePersistedServiceAuth\(nextKeyManager\)/
  )
  assert.match(storeSource, /return validateKeyPair\(/)
  assert.match(routingSource, /\[401, 403, 409\]/)
  assert.match(routingSource, /重置认证/)
})
