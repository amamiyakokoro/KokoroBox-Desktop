import { BrowserWindow, ipcMain } from 'electron'
import { patchAppConfig } from '../config'
import { getProxyStatus } from '../service/api'
import { appendAppLog } from '../utils/log'
import { showNotification } from '../utils/notification'
import { tr } from '../../shared/i18n'
import {
  readSystemProxyEnabled,
  type SysProxyOperationState
} from '../../shared/sysproxy-operation'
import {
  cancelPendingSysProxyRetry,
  triggerSysProxy,
  type TriggerSysProxyOptions
} from './sysproxy'

let state: SysProxyOperationState = {
  revision: 0,
  phase: 'idle',
  desired: null,
  confirmed: null
}
let operationTask: Promise<unknown> = Promise.resolve()
let requestId = 0

function publish(patch: Partial<Omit<SysProxyOperationState, 'revision'>>): void {
  state = { ...state, ...patch, revision: state.revision + 1 }
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('sysProxyOperationUpdated', state)
  }
  ipcMain.emit('updateTrayMenu')
}

function notifyConfigUpdated(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('appConfigUpdated')
  }
}

export function getSysProxyOperationState(): SysProxyOperationState {
  return { ...state }
}

async function confirmAfterUncertainResult(): Promise<boolean | null> {
  try {
    return readSystemProxyEnabled(await getProxyStatus())
  } catch (error) {
    void appendAppLog(`[Sysproxy]: status query failed, ${error}\n`)
    return null
  }
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return (
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    (error instanceof Error && /timeout|timed out|ETIMEDOUT/i.test(error.message))
  )
}

export function changeSysProxy(
  enable: boolean,
  onlyActiveDevice: boolean
): Promise<SysProxyOperationState> {
  const id = ++requestId
  const queuedAt = performance.now()
  if (!enable || state.phase === 'waiting-network') cancelPendingSysProxyRetry()
  publish({ phase: enable ? 'enabling' : 'disabling', desired: enable, error: undefined })
  const task = operationTask.then(async () => {
    if (id !== requestId) return getSysProxyOperationState()
    let systemApplied = false
    let waitingForNetwork = false
    const timings: string[] = [`operation_queue=${(performance.now() - queuedAt).toFixed(1)}ms`]
    const logTimings = (outcome: string): void => {
      void appendAppLog(`[Sysproxy]: ${outcome} ${timings.splice(0).join(' ')}\n`)
    }
    const options: TriggerSysProxyOptions = {
      onTiming: (stage, durationMs) => timings.push(`${stage}=${durationMs.toFixed(1)}ms`),
      onSystemApplied: () => {
        systemApplied = true
      },
      onRetryResult: (result) => {
        if (id !== requestId) return
        logTimings(`retry ${result}`)
        if (result === 'applied') {
          publish({ phase: 'idle', desired: true, confirmed: true, error: undefined })
        } else {
          publish({ phase: 'waiting-network', desired: true, error: undefined })
        }
      },
      onRetryError: (error) => {
        if (id !== requestId) return
        logTimings('retry failed')
        if (isTimeout(error)) {
          publish({ phase: 'unconfirmed', desired: true, confirmed: null, error: String(error) })
          void confirmAfterUncertainResult().then((confirmed) => {
            if (id === requestId && confirmed !== null) {
              publish({ phase: 'idle', desired: true, confirmed, error: String(error) })
            }
          })
        } else {
          publish({
            phase: 'idle',
            desired: true,
            confirmed: systemApplied ? true : state.confirmed,
            error: String(error)
          })
          void showNotification({
            title: tr('System proxy operation failed'),
            body: String(error),
            variant: 'danger'
          })
        }
      }
    }
    try {
      const result = await triggerSysProxy(enable, onlyActiveDevice, false, options)
      if (result === 'superseded' || id !== requestId) return getSysProxyOperationState()
      waitingForNetwork = result === 'waiting-network'
      const saveStartedAt = performance.now()
      try {
        await patchAppConfig({ sysProxy: { enable } })
      } finally {
        timings.push(`config=${(performance.now() - saveStartedAt).toFixed(1)}ms`)
      }
      notifyConfigUpdated()
      if (result === 'waiting-network') {
        publish({ phase: 'waiting-network', desired: true, error: undefined })
      } else {
        publish({ phase: 'idle', desired: enable, confirmed: enable, error: undefined })
      }
      return getSysProxyOperationState()
    } catch (error) {
      if (id === requestId) {
        if (waitingForNetwork) cancelPendingSysProxyRetry()
        if (isTimeout(error)) {
          publish({ phase: 'unconfirmed', desired: enable, confirmed: null, error: String(error) })
          const confirmed = await confirmAfterUncertainResult()
          if (id !== requestId) return getSysProxyOperationState()
          if (confirmed === enable) {
            publish({ phase: 'idle', desired: enable, confirmed, error: undefined })
            const saveStartedAt = performance.now()
            try {
              await patchAppConfig({ sysProxy: { enable } })
              notifyConfigUpdated()
            } catch (saveError) {
              publish({ error: String(saveError) })
              throw saveError
            } finally {
              timings.push(`config=${(performance.now() - saveStartedAt).toFixed(1)}ms`)
            }
            return getSysProxyOperationState()
          }
          if (confirmed === null) return getSysProxyOperationState()
          publish({ phase: 'idle', desired: enable, confirmed, error: String(error) })
        } else {
          publish({
            phase: 'idle',
            desired: enable,
            confirmed: systemApplied ? enable : state.confirmed,
            error: String(error)
          })
        }
      }
      throw error
    } finally {
      logTimings(enable ? 'enable' : 'disable')
    }
  })
  operationTask = task.catch(() => {})
  return task
}
