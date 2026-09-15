import * as native from 'kokorobox-native'
import type { NetworkContext } from 'kokorobox-native'
import { appendAppLog } from '../utils/log'

export type ObservableNetworkContext = NetworkContext & { online: boolean }

type NetworkContextListener = (context: ObservableNetworkContext) => void | Promise<void>

const listeners = new Set<NetworkContextListener>()
let currentContext: ObservableNetworkContext | undefined
let watcherGeneration = 0
let watcherPromise: Promise<void> | undefined

type NativeNetworkMonitor = {
  waitForNetworkContextChange?: (
    previous: ObservableNetworkContext,
    timeoutMs?: number
  ) => Promise<ObservableNetworkContext | null>
}

const nativeNetworkMonitor = native as unknown as NativeNetworkMonitor

async function notifyListeners(context: ObservableNetworkContext): Promise<void> {
  await Promise.allSettled(Array.from(listeners, (listener) => listener(context)))
}

async function runWatcher(generation: number): Promise<void> {
  if (!nativeNetworkMonitor.waitForNetworkContextChange) {
    throw new Error('Installed kokorobox-native does not include network monitoring')
  }
  let context = (await native.getNetworkContext()) as ObservableNetworkContext
  if (generation !== watcherGeneration) return
  currentContext = context
  await notifyListeners(context)

  while (true) {
    if (generation !== watcherGeneration || listeners.size === 0) return
    const next = await nativeNetworkMonitor.waitForNetworkContextChange(context, 30_000)
    if (generation !== watcherGeneration) return
    if (!next) continue
    context = next
    currentContext = next
    await notifyListeners(next)
  }
}

function ensureWatcher(): void {
  if (watcherPromise || listeners.size === 0) return
  const generation = ++watcherGeneration
  watcherPromise = runWatcher(generation)
    .catch(async (error) => {
      await appendAppLog(`[Network]: native context watcher failed, ${error}\n`)
      await new Promise((resolve) => {
        setTimeout(resolve, 2000)
      })
    })
    .finally(() => {
      watcherPromise = undefined
      if (listeners.size > 0 && generation === watcherGeneration) ensureWatcher()
    })
}

export function observeNetworkContext(listener: NetworkContextListener): () => void {
  listeners.add(listener)
  if (currentContext) void listener(currentContext)
  ensureWatcher()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) watcherGeneration++
  }
}

export async function readNetworkContext(): Promise<ObservableNetworkContext> {
  return currentContext ?? ((await native.getNetworkContext()) as ObservableNetworkContext)
}
