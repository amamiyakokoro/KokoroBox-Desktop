import { useSyncExternalStore } from 'react'
import {
  createTrafficHistoryStore,
  trafficPersistenceIntervalMs
} from '../utils/traffic-history-store'

// Access storage lazily so disabled localStorage is handled by the store.
const traffic = createTrafficHistoryStore({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key)
})

/** Installed by App, so navigating away from Home does not stop collection. */
export function startOverviewTrafficCollection(): () => void {
  const removeTraffic = window.electron.ipcRenderer.on(
    'mihomoTraffic',
    (_event, info: ControllerTraffic) => traffic.receive(info)
  )
  const removeStarted = window.electron.ipcRenderer.on('core-started', traffic.resetLive)
  const removeStopped = window.electron.ipcRenderer.on('core-stopped', traffic.resetLive)
  const tick = window.setInterval(traffic.tick, 1000)
  const persist = window.setInterval(traffic.flush, trafficPersistenceIntervalMs)
  const onVisible = (): void => {
    traffic.tick()
    if (document.hidden) traffic.flush()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pagehide', traffic.flush)
  return () => {
    removeTraffic()
    removeStarted()
    removeStopped()
    window.clearInterval(tick)
    window.clearInterval(persist)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pagehide', traffic.flush)
    traffic.flush()
  }
}

export function useOverviewTraffic() {
  return useSyncExternalStore(traffic.subscribe, traffic.getSnapshot)
}
