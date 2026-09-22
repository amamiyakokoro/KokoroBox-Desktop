import { tr } from '../../shared/i18n'
import { getAppConfig, getControledMihomoConfig } from '../config'
import { pacPort, startPacServer, stopPacServer } from '../resolve/server'
import { net } from 'electron'
import { isAxiosError } from 'axios'
import {
  disableProxy,
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

let defaultBypass: string[]
let triggerSysProxyTimer: NodeJS.Timeout | null = null
let sysproxyLeaseTimer: NodeJS.Timeout | null = null
let triggerSysProxyTask = Promise.resolve()
let triggerSysProxyRequest = 0
let sysproxyGuardEventsStartedAt = 0
let lastSysproxyGuardNotificationKey = ''
let unsubscribeSysproxyGuardEvents: (() => void) | null = null

export interface TriggerSysProxyOptions {
  serviceRequestTimeoutMs?: number
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
        isAxiosError(error) &&
        error.response?.status === 409
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
): Promise<void> {
  const request = ++triggerSysProxyRequest
  if (triggerSysProxyTimer) {
    clearTimeout(triggerSysProxyTimer)
    triggerSysProxyTimer = null
  }
  const task = triggerSysProxyTask.then(() =>
    triggerSysProxyImpl(enable, onlyActiveDevice, useRegistry, request, options)
  )
  triggerSysProxyTask = task.catch(() => {})
  return task
}

async function triggerSysProxyImpl(
  enable: boolean,
  onlyActiveDevice: boolean,
  useRegistry: boolean,
  request: number,
  options: TriggerSysProxyOptions
): Promise<void> {
  if (enable) {
    if (net.isOnline()) {
      await setSysProxy(onlyActiveDevice, useRegistry)
    } else {
      if (request !== triggerSysProxyRequest) return
      triggerSysProxyTimer = setTimeout(() => {
        triggerSysProxy(enable, onlyActiveDevice, useRegistry, options).catch((error) => {
          appendAppLog(`[Sysproxy]: retry enable failed, ${error}\n`).catch(() => {})
        })
      }, 5000)
    }
  } else {
    await disableSysProxy(onlyActiveDevice, useRegistry, options)
  }
}

async function setSysProxy(onlyActiveDevice: boolean, useRegistry = false): Promise<void> {
  if (process.platform === 'linux')
    defaultBypass = [
      'localhost',
      '.local',
      '127.0.0.1/8',
      '192.168.0.0/16',
      '10.0.0.0/8',
      '172.16.0.0/12',
      '::1'
    ]
  if (process.platform === 'darwin')
    defaultBypass = [
      '127.0.0.1/8',
      '192.168.0.0/16',
      '10.0.0.0/8',
      '172.16.0.0/12',
      'localhost',
      '*.local',
      '*.crashlytics.com',
      '<local>'
    ]
  if (process.platform === 'win32')
    defaultBypass = [
      'localhost',
      '127.*',
      '192.168.*',
      '10.*',
      '172.16.*',
      '172.17.*',
      '172.18.*',
      '172.19.*',
      '172.20.*',
      '172.21.*',
      '172.22.*',
      '172.23.*',
      '172.24.*',
      '172.25.*',
      '172.26.*',
      '172.27.*',
      '172.28.*',
      '172.29.*',
      '172.30.*',
      '172.31.*',
      '<local>'
    ]
  await startPacServer()
  const { sysProxy } = await getAppConfig()
  const { mode, host, bypass = defaultBypass, terminalProxy = false } = sysProxy
  const guard = !!sysProxy.guard
  const guardNotify = guard && !!sysProxy.guardNotify
  const { 'mixed-port': port = 7890 } = await getControledMihomoConfig()

  switch (mode || 'manual') {
    case 'auto': {
      await setPac(
        `http://${host || '127.0.0.1'}:${pacPort}/pac`,
        '',
        onlyActiveDevice,
        useRegistry,
        guard
      )
      updateSysproxyGuardEventStream(guardNotify)
      startSysproxyLeaseRenewal(onlyActiveDevice, useRegistry)
      break
    }

    case 'manual': {
      if (port != 0) {
        await setProxy(
          `${host || '127.0.0.1'}:${port}`,
          bypass.join(','),
          '',
          onlyActiveDevice,
          useRegistry,
          guard
        )
        updateSysproxyGuardEventStream(guardNotify)
        startSysproxyLeaseRenewal(onlyActiveDevice, useRegistry)
      } else {
        updateSysproxyGuardEventStream(false)
        stopSysproxyLeaseRenewal()
      }
      break
    }
  }

  if (process.platform === 'linux') {
    if (terminalProxy && port !== 0) {
      await enableTerminalProxy(host || '127.0.0.1', port, bypass)
    } else {
      await disableTerminalProxy()
    }
  }
}

async function disableSysProxy(
  onlyActiveDevice: boolean,
  useRegistry = false,
  options: TriggerSysProxyOptions = {}
): Promise<void> {
  stopSysproxyLeaseRenewal()
  await stopPacServer()
  updateSysproxyGuardEventStream(false)

  try {
    await disableProxy('', onlyActiveDevice, useRegistry, options.serviceRequestTimeoutMs)
  } finally {
    await disableTerminalProxy()
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
