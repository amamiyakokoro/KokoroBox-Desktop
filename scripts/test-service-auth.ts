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
  const dirsSource = readFileSync(resolve('src/main/utils/dirs.ts'), 'utf8')
  const coreProfileSource = readFileSync(resolve('src/main/core/profile-check.ts'), 'utf8')
  const kokoroProfileSource = readFileSync(resolve('src/main/kokoro/profile-check.ts'), 'utf8')
  const trafficMonitorSource = readFileSync(resolve('src/main/resolve/trafficMonitor.ts'), 'utf8')
  const miscSource = readFileSync(resolve('src/main/sys/misc.ts'), 'utf8')
  const updaterSource = readFileSync(resolve('src/main/resolve/autoUpdater.ts'), 'utf8')

  assert.match(managerSource, /\['service', 'status'\],[\s\S]*windowsHide: true/)
  assert.match(elevationSource, /timeout: 30000, windowsHide: true/)
  assert.match(autoRunSource, /schtasks\.exe[\s\S]*windowsHide: true/)
  assert.equal(
    (sysproxySource.match(/windowsHide: process\.platform === 'win32'/g) || []).length,
    3
  )
  assert.match(dirsSource, /execFileSync\('where\.exe',[\s\S]*windowsHide: true/)
  assert.doesNotMatch(dirsSource, /execSync\(`\$\{whichCmd\}/)
  assert.match(coreProfileSource, /windowsHide: process\.platform === 'win32'/)
  assert.match(kokoroProfileSource, /windowsHide: process\.platform === 'win32'/)
  assert.match(trafficMonitorSource, /TrafficMonitor\.exe'[\s\S]*windowsHide: true/)
  assert.match(miscSource, /execFilePromise\(uwpToolPath, \[\], \{ windowsHide:/)
  assert.equal((updaterSource.match(/windowsHide: true/g) || []).length, 2)
})

test('macOS registers the bundled daemon through SMAppService', () => {
  const managerSource = readFileSync(resolve('src/main/service/manager.ts'), 'utf8')
  const apiSource = readFileSync(resolve('src/main/service/api.ts'), 'utf8')
  const adapterSource = readFileSync(resolve('src/main/service/macos-smappservice.ts'), 'utf8')
  const bridgeSource = readFileSync(
    resolve('native/macos-service/KokoroBoxServiceManagementBridge.mm'),
    'utf8'
  )
  const launchDaemon = readFileSync(resolve('build/macos-service/KokoroBoxService.plist'), 'utf8')
  const builderSource = readFileSync(resolve('electron-builder.yml'), 'utf8')
  const packageSource = readFileSync(resolve('package.json'), 'utf8')
  const dirsSource = readFileSync(resolve('src/main/utils/dirs.ts'), 'utf8')
  const preinstallSource = readFileSync(resolve('build/pkg-scripts/preinstall'), 'utf8')
  const postinstallSource = readFileSync(resolve('build/pkg-scripts/postinstall'), 'utf8')

  assert.match(adapterSource, /process\.dlopen\(nativeModule, target\)/)
  assert.match(adapterSource, /registerMacOSService/)
  assert.match(adapterSource, /unregisterMacOSService/)
  assert.match(adapterSource, /requires-approval/)
  assert.match(bridgeSource, /daemonServiceWithPlistName:KBServicePlistName/)
  assert.match(bridgeSource, /registerAndReturnError/)
  assert.match(bridgeSource, /unregisterAndReturnError/)
  assert.match(bridgeSource, /openSystemSettingsLoginItems/)
  assert.match(launchDaemon, /<key>BundleProgram<\/key>/)
  assert.match(launchDaemon, /<string>Contents\/Resources\/files\/kokorobox-service<\/string>/)
  assert.match(launchDaemon, /<string>service<\/string>[\s\S]*<string>run<\/string>/)
  assert.match(launchDaemon, /<key>UserName<\/key>\s*<string>root<\/string>/)
  assert.match(builderSource, /Library\/LaunchDaemons\/KokoroBoxService\.plist/)
  assert.match(packageSource, /prepare:macos-service/)
  assert.match(dirsSource, /\/Library\/LaunchDaemons\/KokoroBoxService\.plist/)
  assert.match(managerSource, /registerMacOSService\(\)/)
  assert.match(managerSource, /unregisterMacOSService\(\)/)
  assert.match(managerSource, /status === 'requires-approval'/)
  assert.match(managerSource, /export async function ensureMacOSServiceReady/)
  const initSource = managerSource.slice(
    managerSource.indexOf('export async function initService'),
    managerSource.indexOf('export async function installService')
  )
  assert.match(
    initSource,
    /process\.platform === 'darwin'[\s\S]*bootstrapMacOSServiceAuth\(secret\.publicKey\)[\s\S]*await waitForServiceReady\(\)[\s\S]*return/
  )
  assert.doesNotMatch(initSource, /'--ensure-running'/)
  const bootstrapApiSource = apiSource.slice(
    apiSource.indexOf('export const bootstrapMacOSServiceAuth'),
    apiSource.indexOf('export const getCoreStatus')
  )
  assert.match(bootstrapApiSource, /axios\.post\([\s\S]*'\/bootstrap'/)
  assert.doesNotMatch(bootstrapApiSource, /getServiceAxios\(\)/)
  const ensureReadySource = managerSource.slice(
    managerSource.indexOf('export async function ensureMacOSServiceReady'),
    managerSource.indexOf('export async function uninstallService')
  )
  assert.doesNotMatch(ensureReadySource, /await startService\(\)/)
  assert.match(
    managerSource,
    /execWithElevation\('\/bin\/launchctl', \['bootout', 'system\/KokoroBoxService'\]\)/
  )
  assert.match(
    managerSource,
    /execWithElevation\('\/bin\/rm', \['-f', macOSServiceRuntimePath\(\)\]\)/
  )
  assert.match(managerSource, /'kickstart',[\s\S]*'-k',[\s\S]*'system\/KokoroBoxService'/)
  assert.match(managerSource, /'kill',[\s\S]*'SIGTERM',[\s\S]*'system\/KokoroBoxService'/)
  assert.doesNotMatch(managerSource, /(?:sh|bash)', \['-c'/)
  assert.doesNotMatch(managerSource, /execWithElevation\('\/usr\/bin\/install'/)
  assert.match(preinstallSource, /launchctl kill SIGTERM "system\/\$service_name"/)
  assert.match(preinstallSource, /rm -f "\$KOKOROBOX_SERVICE_RUNTIME_BIN"/)
  assert.match(postinstallSource, /launchctl kickstart -k system\/KokoroBoxService/)
  assert.doesNotMatch(postinstallSource, /\/usr\/bin\/install|service install/)
})

test('macOS privileged core features fail closed through the service boundary', () => {
  const coreManagerSource = readFileSync(resolve('src/main/core/manager.ts'), 'utf8')
  const runtimeSource = readFileSync(resolve('src/main/core/service-core-runtime.ts'), 'utf8')
  const permissionSource = readFileSync(resolve('src/main/core/permission.ts'), 'utf8')
  const settingsSource = readFileSync(resolve('src/renderer/src/pages/mihomo.tsx'), 'utf8')

  assert.match(
    coreManagerSource,
    /process\.platform === 'darwin' && tun\?\.enable && corePermissionMode !== 'service'/
  )
  assert.match(coreManagerSource, /await ensureMacOSServiceReady\(\)/)
  assert.match(
    runtimeSource,
    /process\.platform === 'darwin'[\s\S]*macOS service core unavailable[\s\S]*throw new Error/
  )
  assert.match(runtimeSource, /preserveMacOSServiceCore/)
  assert.match(
    permissionSource,
    /process\.platform === 'darwin'[\s\S]*macOS 特权功能需要 KokoroBox 服务/
  )
  assert.match(settingsSource, /platform !== 'darwin'/)
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
