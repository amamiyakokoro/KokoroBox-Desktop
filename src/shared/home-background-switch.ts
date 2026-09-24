import {
  nextHomeDefaultBackgroundId,
  normalizeHomeDefaultBackgroundId,
  type HomeDefaultBackgroundId
} from './home'

interface SwitchState {
  mode: 'default' | 'custom' | 'none'
  selectedId: HomeDefaultBackgroundId
}

/** Serialize manual switches; commit only after the next image has decoded. */
export function createHomeBackgroundSwitch(
  getState: () => SwitchState,
  preload: (id: HomeDefaultBackgroundId) => Promise<void>,
  persist: (id: HomeDefaultBackgroundId) => Promise<void>
): () => Promise<boolean> {
  let pending = false
  return async () => {
    if (pending) return false
    const start = getState()
    if (start.mode !== 'default') return false
    const currentId = normalizeHomeDefaultBackgroundId(start.selectedId)
    const nextId = nextHomeDefaultBackgroundId(currentId)
    pending = true
    try {
      await preload(nextId)
      const latest = getState()
      if (latest.mode !== 'default' || latest.selectedId !== currentId) return false
      await persist(nextId)
      return true
    } finally {
      pending = false
    }
  }
}
