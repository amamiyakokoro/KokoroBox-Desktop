import { getAppName, getIconDataURL } from './ipc'
import { cropAndPadTransparent } from './image'
import { platform } from './init'

export interface ApplicationMetadata {
  name?: string
  iconUrl?: string
}

const maximumEntries = 128
const maximumQueued = 64
const maximumConcurrent = 3
const cache = new Map<string, Promise<ApplicationMetadata>>()
const completed = new Set<string>()
const queue: Array<() => void> = []
let active = 0

function drain(): void {
  while (active < maximumConcurrent && queue.length > 0) {
    active += 1
    queue.shift()?.()
  }
}

function trimCache(): void {
  if (cache.size <= maximumEntries) return
  for (const key of cache.keys()) {
    if (cache.size <= maximumEntries) break
    if (completed.has(key)) {
      cache.delete(key)
      completed.delete(key)
    }
  }
}

async function readMetadata(path: string): Promise<ApplicationMetadata> {
  const [nameResult, iconResult] = await Promise.allSettled([
    getAppName(path),
    getIconDataURL(path)
  ])
  const name =
    nameResult.status === 'fulfilled' && nameResult.value.trim()
      ? nameResult.value.trim()
      : undefined
  let iconUrl =
    iconResult.status === 'fulfilled' && iconResult.value
      ? iconResult.value.startsWith('data:')
        ? iconResult.value
        : `data:image/png;base64,${iconResult.value}`
      : undefined
  if (iconUrl && platform !== 'darwin') {
    try {
      iconUrl = await cropAndPadTransparent(iconUrl)
    } catch {
      // The original local icon is still usable when image padding fails.
    }
  }
  return { name, iconUrl }
}

/** Shared bounded cache for Connections and Home. Failed lookups are cached too. */
export function loadApplicationMetadata(path: string): Promise<ApplicationMetadata> {
  if (!path) return Promise.resolve({})
  const existing = cache.get(path)
  if (existing) {
    cache.delete(path)
    cache.set(path, existing)
    return existing
  }
  if (queue.length >= maximumQueued) return Promise.resolve({})

  const result = new Promise<ApplicationMetadata>((resolve) => {
    queue.push(() => {
      void readMetadata(path)
        .then(resolve, () => resolve({}))
        .finally(() => {
          active -= 1
          completed.add(path)
          trimCache()
          drain()
        })
    })
  })
  cache.set(path, result)
  drain()
  return result
}
