import * as native from 'kokorobox-native'
import { nativeLogLine } from '../../shared/diagnostic-log'
import { appendAppLog } from '../utils/log'

// Feature detection keeps Desktop compatible with Native releases before the
// diagnostic API. Rust worker failures are drained on Electron's main thread.
export function startNativeLogCollection(): () => void {
  const drain = (native as unknown as { drainNativeLogs?: () => unknown[] }).drainNativeLogs
  if (typeof drain !== 'function') return () => {}
  let writing = false
  const collect = (): void => {
    if (writing) return
    let entries: unknown[]
    try {
      entries = drain()
    } catch {
      return
    }
    if (!Array.isArray(entries)) return
    const lines = entries.map(nativeLogLine).filter(Boolean).join('')
    if (!lines) return
    writing = true
    void appendAppLog(lines)
      .catch(() => {})
      .finally(() => {
        writing = false
      })
  }
  collect()
  const timer = setInterval(collect, 1000)
  timer.unref()
  return () => {
    clearInterval(timer)
    collect()
  }
}
