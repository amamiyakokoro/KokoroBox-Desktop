import { powerMonitor } from 'electron'
import { isDeepStrictEqual } from 'node:util'
import { mainWindow } from '..'
import { observeNetworkContext, type ObservableNetworkContext } from '../sys/network-context'

let unsubscribe: (() => void) | undefined
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let lastObservedContext: ObservableNetworkContext | undefined

function queueRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined
    mainWindow?.webContents.send('homeNetworkChanged')
  }, 750)
}

export function startHomeNetworkObservation(): void {
  if (unsubscribe) return
  // The observer can report the same initial context twice when its watcher
  // restarts. Neither report is a network change on Home open.
  unsubscribe = observeNetworkContext((context) => {
    if (!lastObservedContext || isDeepStrictEqual(lastObservedContext, context)) {
      lastObservedContext = context
      return
    }
    lastObservedContext = context
    queueRefresh()
  })
  powerMonitor.on('resume', queueRefresh)
}

export function stopHomeNetworkObservation(): void {
  unsubscribe?.()
  unsubscribe = undefined
  powerMonitor.off('resume', queueRefresh)
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = undefined
}
