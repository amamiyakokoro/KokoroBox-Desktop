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
import { parseServiceLog } from '../src/main/service/log-parser'

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

test('Windows service probes and elevated commands never open a console window', () => {
  const managerSource = readFileSync(resolve('src/main/service/manager.ts'), 'utf8')
  const elevationSource = readFileSync(resolve('src/main/utils/elevation.ts'), 'utf8')
  const autoRunSource = readFileSync(resolve('src/main/sys/autoRun.ts'), 'utf8')
  const sysproxySource = readFileSync(resolve('src/main/sys/sysproxy.ts'), 'utf8')

  assert.match(managerSource, /\['service', 'status'\],[\s\S]*windowsHide: true/)
  assert.match(elevationSource, /timeout: 30000, windowsHide: true/)
  assert.match(autoRunSource, /schtasks\.exe[\s\S]*windowsHide: true/)
  assert.equal(
    (sysproxySource.match(/windowsHide: process\.platform === 'win32'/g) || []).length,
    3
  )
})

test('service status parser handles nested pretty and single-line JSON logs', () => {
  const pretty = `wrapper output
{
  "level": "info",
  "msg": "Service status: running",
  "status": {
    "action": "status",
    "state": "running",
    "success": true
  }
}
trailing output`
  const singleLine =
    '{"level":"error","msg":"Failed to query service status","status":{"state":"not-installed","success":false}}'

  assert.equal(parseServiceLog(pretty)?.status?.state, 'running')
  assert.equal(parseServiceLog(singleLine)?.status?.state, 'not-installed')
  assert.equal(
    parseServiceLog('{"msg":"brace } inside a string","status":{"state":"stopped"}}')?.status
      ?.state,
    'stopped'
  )
})

test('Desktop signs service requests with Auth V3 and retries a legacy service once with V2', () => {
  const apiSource = readFileSync(resolve('src/main/service/api.ts'), 'utf8')

  assert.match(apiSource, /currentServiceAuthVersion: ServiceAuthVersion = '3'/)
  assert.match(apiSource, /'2': 'SPARKLE-AUTH-V2'/)
  assert.match(apiSource, /'3': 'KOKOROBOX-AUTH-V3'/)
  assert.match(apiSource, /config\.__kokoroboxServiceAuthVersion = '2'/)
  assert.match(apiSource, /config\.__kokoroboxServiceAuthFallbackAttempted = true/)
})
