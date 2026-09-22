import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  EARLY_TLS_DISCONNECT_MESSAGE,
  beginExpectedNetworkTransition,
  installEarlyTlsDisconnectRecovery,
  isEarlyTlsDisconnect,
  isExpectedNetworkTransition,
  resetExpectedNetworkTransitionForTest,
  type MainProcessErrorOrigin
} from '../src/main/utils/earlyTlsDisconnect'

test('recognizes an early TLS disconnect directly and through an error cause', () => {
  const tlsError = new Error(EARLY_TLS_DISCONNECT_MESSAGE)
  assert.equal(isEarlyTlsDisconnect(tlsError), true)
  assert.equal(isEarlyTlsDisconnect(new Error('request failed', { cause: tlsError })), true)
  assert.equal(isEarlyTlsDisconnect(new Error('socket reset')), false)
})

test('recovers only early TLS disconnect process errors', () => {
  const emitter = new EventEmitter()
  const reports: Array<{ error: Error; origin: MainProcessErrorOrigin }> = []
  const rethrows: unknown[] = []
  const uninstall = installEarlyTlsDisconnectRecovery(
    (error, origin) => reports.push({ error, origin }),
    emitter,
    (reason) => {
      rethrows.push(reason)
    }
  )
  const tlsError = new Error(EARLY_TLS_DISCONNECT_MESSAGE)

  emitter.emit(
    'unhandledRejection',
    tlsError,
    Promise.reject().catch(() => {})
  )
  emitter.emit('uncaughtException', tlsError, 'unhandledRejection')

  assert.deepEqual(
    reports.map(({ origin }) => origin),
    ['unhandledRejection', 'uncaughtException']
  )
  assert.deepEqual(rethrows, [])

  const programmingError = new Error('programming error')
  emitter.emit('uncaughtException', programmingError, 'uncaughtException')
  assert.deepEqual(rethrows, [programmingError])
  assert.equal(emitter.listenerCount('uncaughtException'), 0)
  assert.equal(emitter.listenerCount('unhandledRejection'), 0)

  uninstall()
})

test('tracks nested expected network transitions and keeps a completion grace period', () => {
  resetExpectedNetworkTransitionForTest()
  let now = 1_000
  const clock = (): number => now
  const finishFirst = beginExpectedNetworkTransition(clock, 5_000)
  const finishSecond = beginExpectedNetworkTransition(clock, 5_000)

  assert.equal(isExpectedNetworkTransition(now), true)
  finishFirst()
  assert.equal(isExpectedNetworkTransition(now), true)

  now = 2_000
  finishSecond()
  assert.equal(isExpectedNetworkTransition(6_999), true)
  assert.equal(isExpectedNetworkTransition(7_001), false)

  // Completion callbacks are idempotent and cannot corrupt transition depth.
  finishSecond()
  assert.equal(isExpectedNetworkTransition(7_001), false)
  resetExpectedNetworkTransitionForTest()
})

test('main renderer load failures use bounded retries and retain diagnostics', () => {
  const source = readFileSync(resolve('src/main/index.ts'), 'utf8')
  assert.match(source, /mainFrameLoadFailureCount > 2/)
  assert.match(source, /renderer-content-ready.+resetMainFrameLoadFailures/)
  assert.match(source, /\[Window\]: main frame load failed/)
  assert.match(source, /render-process-gone/)
  assert.match(source, /\[Window\]: renderer process exited/)
})

test('application quit cannot wait indefinitely for cleanup or renderer confirmation', () => {
  const source = readFileSync(resolve('src/main/resolve/appLifecycle.ts'), 'utf8')
  const startup = readFileSync(resolve('src/main/index.ts'), 'utf8')
  const sysproxy = readFileSync(resolve('src/main/sys/sysproxy.ts'), 'utf8')

  assert.match(source, /cleanupTaskTimeoutMs = 8_000/)
  assert.match(source, /responsiveCleanupTaskTimeoutMs = 3_000/)
  assert.match(source, /exitServiceRequestTimeoutMs = 2_500/)
  assert.match(source, /Promise\.race\(\[/)
  assert.match(source, /runCleanupTask\('stop application routing'/)
  assert.match(source, /'disable system proxy'/)
  assert.match(source, /'stop core'/)
  assert.match(source, /runCleanupTask\('stop traffic presenter'/)
  assert.match(source, /mainWindow\.hide\(\)/)
  assert.match(source, /app\.dock\?\.hide\(\)/)
  assert.doesNotMatch(source, /disableSysProxySync|asyncSysProxyCleanupSucceeded/)
  assert.doesNotMatch(startup, /function exitApp\(\): void \{\s*disableSysProxySync\(\)/)
  assert.match(sysproxy, /options\.serviceRequestTimeoutMs/)
  assert.doesNotMatch(sysproxy, /commandTimeoutMs/)
  assert.match(source, /quitConfirmationTimeoutMs = 30_000/)
  assert.match(source, /webContents\.once\('destroyed', handleRendererUnavailable\)/)
  assert.match(source, /if \(quitPromise\) return quitPromise/)
})

test('system proxy uses KokoroBox Service as its only mutation authority', () => {
  const sysproxy = readFileSync(resolve('src/main/sys/sysproxy.ts'), 'utf8')
  const coreRuntime = readFileSync(resolve('src/main/core/service-core-runtime.ts'), 'utf8')
  const ipc = readFileSync(resolve('src/main/utils/ipc.ts'), 'utf8')
  const init = readFileSync(resolve('src/main/utils/init.ts'), 'utf8')
  const template = readFileSync(resolve('src/main/utils/template.ts'), 'utf8')
  const types = readFileSync(resolve('src/shared/types/app.d.ts'), 'utf8')
  const settings = readFileSync(
    resolve('src/renderer/src/components/settings/network/system-proxy-settings.tsx'),
    'utf8'
  )

  assert.match(sysproxy, /await setPac\(/)
  assert.match(sysproxy, /await setProxy\(/)
  assert.match(sysproxy, /await disableProxy\(/)
  assert.doesNotMatch(sysproxy, /child_process|servicePath|settingMode|registryArgs/)
  assert.match(coreRuntime, /const useServiceSysProxy = sysProxy\.enable/)
  assert.match(ipc, /patch\.sysProxy\?\.enable !== true/)
  assert.match(init, /'settingMode' in \(appConfig\.sysProxy as object\)/)
  assert.match(init, /settingMode: undefined/)
  assert.doesNotMatch(template, /settingMode/)
  assert.doesNotMatch(types, /settingMode/)
  assert.doesNotMatch(settings, /settingMode|Configuration method|Run command/)
})
