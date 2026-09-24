import { tr } from '../../shared/i18n'
import { getAppConfig, getControledMihomoConfig } from '../config'
import { startPacServer, stopPacServer } from '../resolve/server'
import { localPacUrl } from '../resolve/pac-http-server'
import { defaultSystemProxyBypass, normalizeProxyHost } from '../../shared/system-proxy'
import { net } from 'electron'
import {
  ServiceAPIError,
  disableProxy,
  getServiceMeta,
  renewSysProxyLease,
  setPac,
  setProxy,
  startServiceSysproxyEventStream,
  stopServiceSysproxyEventStream,
  subscribeServiceSysproxyEvents
} from '../service/api'
import type { ServiceSysproxyEvent } from '../service/api'
import { appendAppLog } from '../utils/log'
import { showNotification } from '../utils/notification'
import { disableTerminalProxy, enableTerminalProxy } from './terminal-proxy'
import { observeNetworkContext, type ObservableNetworkContext } from './network-context'
import { shouldReapplyProxyForNetworkChange } from './sysproxy-network'

let triggerSysProxyTimer: NodeJS.Timeout | null = null
let sysproxyLeaseTimer: NodeJS.Timeout | null = null
let triggerSysProxyTask = Promise.resolve()
let triggerSysProxyRequest = 0
let sysproxyGuardEventsStartedAt = 0
let lastSysproxyGuardNotificationKey = ''
let unsubscribeSysproxyGuardEvents: (() => void) | null = null
let stopSysproxyNetworkObserver: (() => void) | null = null
let sysproxyNetworkTimer: NodeJS.Timeout | null = null
let sysproxyNetworkGeneration = 0

export function cancelPendingSysProxyRetry(): void {
  if (!triggerSysProxyTimer) return
  clearTimeout(triggerSysProxyTimer)
  triggerSysProxyTimer = null
}

export interface TriggerSysProxyOptions {
  serviceRequestTimeoutMs?: number
  onTiming?: (stage: 'queue' | 'pac' | 'service' | 'terminal', durationMs: number) => void
  onRetryResult?: (result: 'applied' | 'waiting-network') => void
  onRetryError?: (error: unknown) => void
  onSystemApplied?: () => void
}

export type TriggerSysProxyResult = 'applied' | 'waiting-network' | 'superseded'

async function timed<T>(
  stage: 'pac' | 'service' | 'terminal',
  options: TriggerSysProxyOptions,
  task: () => Promise<T>
): Promise<T> {
  const startedAt = performance.now()
  try {
    return await task()
  } finally {
    options.onTiming?.(stage, performance.now() - startedAt)
  }
}

export function startSysproxyNetworkRecovery(): void {
  if (stopSysproxyNetworkObserver) return
  let previous: ObservableNetworkContext | undefined
  stopSysproxyNetworkObserver = observeNetworkContext((current) => {
    if (!previous) {
      previous = current
      return
    }
    const changed = shouldReapplyProxyForNetworkChange(previous, current)
    previous = current
    if (!current.online) {
      if (sysproxyNetworkTimer) clearTimeout(sysproxyNetworkTimer)
      sysproxyNetworkTimer = null
      sysproxyNetworkGeneration++
      return
    }
    if (!changed) return

    if (sysproxyNetworkTimer) clearTimeout(sysproxyNetworkTimer)
    const generation = ++sysproxyNetworkGeneration
    const proxyRequest = triggerSysProxyRequest
    sysproxyNetworkTimer = setTimeout(() => {
      sysproxyNetworkTimer = null
      void (async () => {
        const { sysProxy, onlyActiveDevice = false } = await getAppConfig()
        if (
          generation !== sysproxyNetworkGeneration ||
          proxyRequest !== triggerSysProxyRequest ||
          !sysProxy.enable
        ) {
          return
        }
        if (process.platform === 'darwin') {
          try {
            if ((await getServiceMeta()).capabilities.sysproxyNetworkReconcile) return
          } catch {
            // An unavailable or older Service still needs the Desktop fallback.
          }
        }
        if (generation !== sysproxyNetworkGeneration || proxyRequest !== triggerSysProxyRequest) {
          return
        }
        const operation = await import('./sysproxy-operation')
        if (operation.getSysProxyOperationState().phase === 'waiting-network') {
          await operation.changeSysProxy(true, onlyActiveDevice)
        } else {
          await triggerSysProxy(true, onlyActiveDevice)
        }
      })().catch((error) => {
        appendAppLog(`[Sysproxy]: network change recovery failed, ${error}\n`).catch(() => {})
      })
    }, 800)
    sysproxyNetworkTimer.unref()
  })
}

export function stopSysproxyNetworkRecovery(): void {
  sysproxyNetworkGeneration++
  if (sysproxyNetworkTimer) clearTimeout(sysproxyNetworkTimer)
  sysproxyNetworkTimer = null
  stopSysproxyNetworkObserver?.()
  stopSysproxyNetworkObserver = null
}

function stopSysproxyLeaseRenewal(): void {
  if (sysproxyLeaseTimer) clearTimeout(sysproxyLeaseTimer)
  sysproxyLeaseTimer = null
}

function startSysproxyLeaseRenewal(onlyActiveDevice: boolean, useRegistry: boolean): void {
  stopSysproxyLeaseRenewal()
  const request = triggerSysProxyRequest
  const schedule = (): void => {
    if (request !== triggerSysProxyRequest) return
    sysproxyLeaseTimer = setTimeout(
      () =>
        void renew().catch((error) => {
          appendAppLog(`[Sysproxy]: lease renewal failed, ${error}\n`).catch(() => {})
        }),
      20_000
    )
    sysproxyLeaseTimer.unref()
  }
  const renew = async (): Promise<void> => {
    if (request !== triggerSysProxyRequest) return
    let restored = false
    try {
      await renewSysProxyLease()
    } catch (error) {
      appendAppLog(`[Sysproxy]: service lease renewal failed, ${error}\n`).catch(() => {})
      if (
        request === triggerSysProxyRequest &&
        error instanceof ServiceAPIError &&
        error.status === 409
      ) {
        try {
          const { sysProxy } = await getAppConfig()
          if (sysProxy.enable) {
            await setSysProxy(onlyActiveDevice, useRegistry)
            restored = true
          }
        } catch (restoreError) {
          appendAppLog(`[Sysproxy]: restore service lease failed, ${restoreError}\n`).catch(
            () => {}
          )
        }
      }
    }
    if (!restored) schedule()
  }
  schedule()
}

export function triggerSysProxy(
  enable: boolean,
  onlyActiveDevice: boolean,
  useRegistry = false,
  options: TriggerSysProxyOptions = {}
): Promise<TriggerSysProxyResult> {
  const request = ++triggerSysProxyRequest
  const queuedAt = performance.now()
  cancelPendingSysProxyRetry()
  const task = triggerSysProxyTask.then(() => {
    options.onTiming?.('queue', performance.now() - queuedAt)
    return triggerSysProxyImpl(enable, onlyActiveDevice, useRegistry, request, options)
  })
  triggerSysProxyTask = task.then(() => undefined).catch(() => {})
  return task
}

async function triggerSysProxyImpl(
  enable: boolean,
  onlyActiveDevice: boolean,
  useRegistry: boolean,
  request: number,
  options: TriggerSysProxyOptions
): Promise<TriggerSysProxyResult> {
  if (request !== triggerSysProxyRequest) return 'superseded'
  if (enable) {
    if (net.isOnline()) {
      await setSysProxy(onlyActiveDevice, useRegistry, options)
    } else {
      if (request !== triggerSysProxyRequest) return 'superseded'
      triggerSysProxyTimer = setTimeout(() => {
        triggerSysProxy(enable, onlyActiveDevice, useRegistry, options)
          .then((result) => {
            if (result !== 'superseded') options.onRetryResult?.(result)
          })
          .catch((error) => {
            options.onRetryError?.(error)
            appendAppLog(`[Sysproxy]: retry enable failed, ${error}\n`).catch(() => {})
          })
      }, 5000)
      return 'waiting-network'
    }
  } else {
    await disableSysProxy(onlyActiveDevice, useRegistry, options)
  }
  return 'applied'
}

async function setSysProxy(
  onlyActiveDevice: boolean,
  useRegistry = false,
  options: TriggerSysProxyOptions = {}
): Promise<void> {
  const defaultBypass = defaultSystemProxyBypass(process.platform)
  const pacPort = await timed('pac', options, startPacServer)
  const { sysProxy } = await getAppConfig()
  const { mode, host, bypass = defaultBypass, terminalProxy = false } = sysProxy
  const guard = !!sysProxy.guard
  const guardNotify = guard && !!sysProxy.guardNotify
  const { 'mixed-port': port = 7890 } = await getControledMihomoConfig()

  switch (mode || 'manual') {
    case 'auto': {
      if (pacPort === undefined) throw new Error('PAC server did not start')
      await timed('service', options, () =>
        setPac(localPacUrl(pacPort), '', onlyActiveDevice, useRegistry, guard)
      )
      options.onSystemApplied?.()
      updateSysproxyGuardEventStream(guardNotify)
      startSysproxyLeaseRenewal(onlyActiveDevice, useRegistry)
      break
    }

    case 'manual': {
      if (port != 0) {
        await timed('service', options, () =>
          setProxy(
            `${normalizeProxyHost(host || '')}:${port}`,
            bypass.join(','),
            '',
            onlyActiveDevice,
            useRegistry,
            guard
          )
        )
        options.onSystemApplied?.()
        updateSysproxyGuardEventStream(guardNotify)
        startSysproxyLeaseRenewal(onlyActiveDevice, useRegistry)
      } else {
        throw new Error('System proxy port is unavailable')
      }
      break
    }
  }

  if (process.platform === 'linux') {
    if (terminalProxy && port !== 0) {
      await timed('terminal', options, () =>
        enableTerminalProxy(normalizeProxyHost(host || ''), port, bypass)
      )
    } else {
      await timed('terminal', options, disableTerminalProxy)
    }
  }
}

async function disableSysProxy(
  onlyActiveDevice: boolean,
  useRegistry = false,
  options: TriggerSysProxyOptions = {}
): Promise<void> {
  stopSysproxyLeaseRenewal()
  await timed('pac', options, stopPacServer)
  updateSysproxyGuardEventStream(false)

  try {
    await timed('service', options, () =>
      disableProxy('', onlyActiveDevice, useRegistry, options.serviceRequestTimeoutMs)
    )
    options.onSystemApplied?.()
  } finally {
    await timed('terminal', options, disableTerminalProxy)
  }
}

function updateSysproxyGuardEventStream(enabled: boolean): void {
  if (enabled) {
    sysproxyGuardEventsStartedAt = Date.now()
    if (!unsubscribeSysproxyGuardEvents) {
      unsubscribeSysproxyGuardEvents = subscribeServiceSysproxyEvents(handleSysproxyGuardEvent)
    }
    startServiceSysproxyEventStream().catch((error) => {
      appendAppLog(`[Service]: start sysproxy event stream failed, ${error}\n`).catch(() => {})
    })
  } else {
    if (unsubscribeSysproxyGuardEvents) {
      unsubscribeSysproxyGuardEvents()
      unsubscribeSysproxyGuardEvents = null
    }
    stopServiceSysproxyEventStream()
    lastSysproxyGuardNotificationKey = ''
  }
}

async function handleSysproxyGuardEvent(event: ServiceSysproxyEvent): Promise<void> {
  if (!(await shouldNotifySysproxyGuardEvent(event))) return

  if (event.type === 'guard_restored') {
    void showNotification({ title: tr('System proxy restored'), variant: 'success' })
    return
  }

  void showNotification({
    title: tr('Failed to restore system proxy'),
    body: event.error || event.message,
    variant: 'danger'
  })
}

async function shouldNotifySysproxyGuardEvent(event: ServiceSysproxyEvent): Promise<boolean> {
  if (event.type !== 'guard_restored' && event.type !== 'guard_restore_failed') return false

  const eventTime = Date.parse(event.time)
  if (Number.isFinite(eventTime) && eventTime < sysproxyGuardEventsStartedAt) return false

  const { sysProxy } = await getAppConfig()
  if (!sysProxy.guardNotify) return false

  const key = `${event.type}:${event.seq ?? ''}:${event.time}`
  if (key === lastSysproxyGuardNotificationKey) return false
  lastSysproxyGuardNotificationKey = key
  return true
}
