import { powerMonitor } from 'electron'
import { mainWindow } from '..'
import { observeNetworkContext } from '../sys/network-context'

let unsubscribe: (() => void) | undefined
let refreshTimer: ReturnType<typeof setTimeout> | undefined

function queueRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined
    mainWindow?.webContents.send('homeNetworkChanged')
  }, 750)
}

export function startHomeNetworkObservation(): void {
  if (unsubscribe) return
  unsubscribe = observeNetworkContext(queueRefresh)
  powerMonitor.on('resume', queueRefresh)
}

export function stopHomeNetworkObservation(): void {
  unsubscribe?.()
  unsubscribe = undefined
  powerMonitor.off('resume', queueRefresh)
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = undefined
}
