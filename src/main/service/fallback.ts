import { readFileSync, rmSync } from 'fs'
import { rm, writeFile } from 'fs/promises'
import path from 'path'
import { dataDir } from '../utils/dirs'
import { appendAppLog } from '../utils/log'

export const serviceConnectionRetryTimeout = 10_000
const appUpdateServiceConnectionRetryTimeout = 60000
const appUpdateServiceFallbackMarker = 'app-update-service-fallback-paused'
const appUpdateServiceFallbackGrace = 10 * 60 * 1000

let serviceFallbackPausedForAppUpdate = false

export interface ServiceFallbackPolicy {
  pausedForAppUpdate: boolean
  connectionRetryTimeout: number
}

function markerPath(): string {
  return path.join(dataDir(), appUpdateServiceFallbackMarker)
}

function removeAppUpdateFallbackMarkerSync(): void {
  try {
    rmSync(markerPath(), { force: true })
  } catch {
    // ignore cleanup failure
  }
}

export function isServiceFallbackPausedForAppUpdate(): boolean {
  if (serviceFallbackPausedForAppUpdate) {
    return true
  }

  try {
    const timestamp = Number(readFileSync(markerPath(), 'utf-8').trim())
    if (Number.isFinite(timestamp) && Date.now() - timestamp <= appUpdateServiceFallbackGrace) {
      return true
    }
  } catch {
    return false
  }

  removeAppUpdateFallbackMarkerSync()
  return false
}

export function shouldSkipServiceUnavailableFallback(): boolean {
  return isServiceFallbackPausedForAppUpdate()
}

export function getServiceFallbackPolicy(): ServiceFallbackPolicy {
  const pausedForAppUpdate = isServiceFallbackPausedForAppUpdate()
  return {
    pausedForAppUpdate,
    connectionRetryTimeout: pausedForAppUpdate
      ? appUpdateServiceConnectionRetryTimeout
      : serviceConnectionRetryTimeout
  }
}

export async function pauseServiceFallbackForAppUpdate(): Promise<void> {
  serviceFallbackPausedForAppUpdate = true
  await writeFile(markerPath(), Date.now().toString())
  await appendAppLog(`[Updater]: pause service unavailable fallback during app update\n`)
}

export async function clearAppUpdateServiceFallbackPause(): Promise<void> {
  serviceFallbackPausedForAppUpdate = false
  await rm(markerPath(), { force: true }).catch(() => {})
}
