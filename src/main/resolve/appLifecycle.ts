import { app, ipcMain, powerMonitor, type BrowserWindow, type IpcMainEvent } from 'electron'
import { stopCore } from '../core/manager'
import { stopNetworkDetection } from '../core/network'
import { disableSysProxySync, triggerSysProxy } from '../sys/sysproxy'
import { appendAppLog } from '../utils/log'
import { stopAppRouting } from '../app-routing/manager'
import { stopTrafficPresenter } from './trafficPresenter'

interface AppQuitLifecycleContext {
  getMainWindow: () => BrowserWindow | null
  showWindow: () => number
  clearLightweightTimeout: () => void
  exitApp: () => void
}

let isQuitting = false
let notQuitDialog = false
let lastQuitAttempt = 0
let quitPromise: Promise<void> | undefined
let quitConfirmationPromise: Promise<boolean> | undefined
let asyncSysProxyCleanupSucceeded = false

// Cleanup normally completes almost immediately. Keep a bounded fallback for
// unavailable services and OS extensions so an explicit quit can never leave
// the Electron process waiting indefinitely.
const cleanupTaskTimeoutMs = 8_000
const responsiveCleanupTaskTimeoutMs = 3_000
const exitCommandTimeoutMs = 2_000
const exitServiceRequestTimeoutMs = 2_500
const quitConfirmationTimeoutMs = 30_000

export function setNotQuitDialog(): void {
  notQuitDialog = true
}

export function isAppQuitting(): boolean {
  return isQuitting
}

export async function prepareAppForRelaunch(): Promise<void> {
  // A privilege transition is an intentional quit. Complete all cleanup before
  // the replacement process is allowed to acquire shared resources such as the
  // Mihomo controller named pipe, and skip the interactive quit confirmation.
  isQuitting = true
  await cleanupBeforeExit(false)
}

export function initAppQuitLifecycle(context: AppQuitLifecycleContext): void {
  app.on('window-all-closed', () => {
    // Don't quit app when all windows are closed
  })

  app.on('before-quit', (event) => {
    if (isQuitting) return

    event.preventDefault()
    if (notQuitDialog) {
      void quit(context)
      return
    }

    const now = Date.now()
    if (now - lastQuitAttempt < 500) {
      void quit(context)
      return
    }
    lastQuitAttempt = now

    quitConfirmationPromise ??= showQuitConfirmDialog(context).finally(() => {
      quitConfirmationPromise = undefined
    })
    void quitConfirmationPromise.then((confirmed) => {
      if (confirmed) void quit(context)
    })
  })

  powerMonitor.on('shutdown', async () => {
    context.clearLightweightTimeout()
    await cleanupBeforeExit(true)
    context.exitApp()
  })

  app.on('will-quit', () => {
    // Windows keeps a synchronous fallback because system proxy state must not
    // survive the app. Avoid paying for the same command twice after the
    // asynchronous cleanup already completed successfully.
    if (!asyncSysProxyCleanupSucceeded) disableSysProxySync()
  })
}

async function quit(context: AppQuitLifecycleContext): Promise<void> {
  if (quitPromise) return quitPromise
  isQuitting = true
  quitPromise = (async () => {
    context.clearLightweightTimeout()
    const mainWindow = context.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
    if (process.platform === 'darwin') app.dock?.hide()
    await cleanupBeforeExit(false, true)
    context.exitApp()
  })()
  return quitPromise
}

async function cleanupBeforeExit(useRegistry: boolean, responsiveQuit = false): Promise<void> {
  await runCleanupTask('stop network detection', async () => stopNetworkDetection())

  const responsiveTimeoutMs = responsiveQuit ? responsiveCleanupTaskTimeoutMs : cleanupTaskTimeoutMs
  const sysProxyOptions = responsiveQuit
    ? {
        commandTimeoutMs: exitCommandTimeoutMs,
        serviceRequestTimeoutMs: exitServiceRequestTimeoutMs
      }
    : undefined

  const sysProxyCleanup = runCleanupTask(
    'disable system proxy',
    async () => triggerSysProxy(false, false, useRegistry, sysProxyOptions),
    responsiveTimeoutMs
  ).then((succeeded) => {
    asyncSysProxyCleanupSucceeded = succeeded
  })

  await Promise.all([
    runCleanupTask('stop application routing', stopAppRouting, responsiveTimeoutMs),
    sysProxyCleanup,
    runCleanupTask(
      'stop core',
      async () => stopCore(false, responsiveQuit ? exitServiceRequestTimeoutMs : undefined),
      cleanupTaskTimeoutMs
    ),
    runCleanupTask('stop traffic presenter', stopTrafficPresenter, responsiveTimeoutMs)
  ])
}

async function runCleanupTask(
  name: string,
  task: () => void | Promise<void>,
  timeoutMs = cleanupTaskTimeoutMs
): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined
  const startedAt = Date.now()
  try {
    await Promise.race([
      Promise.resolve().then(task),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)
      })
    ])
    return true
  } catch (error) {
    await appendAppLog(
      `[App]: ${name} before exit failed after ${Date.now() - startedAt} ms, ${error}\n`
    ).catch(() => {})
    return false
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function showQuitConfirmDialog(context: AppQuitLifecycleContext): Promise<boolean> {
  return new Promise((resolve) => {
    const mainWindow = context.getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
      resolve(true)
      return
    }

    let settled = false
    const confirmTimer = setTimeout(() => finish(false), quitConfirmationTimeoutMs)
    const finish = (confirmed: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(showTimer)
      clearTimeout(confirmTimer)
      ipcMain.off('quit-confirm-result', handleQuitConfirm)
      mainWindow.webContents.off('destroyed', handleRendererUnavailable)
      resolve(confirmed)
    }
    const handleRendererUnavailable = (): void => finish(true)
    const handleQuitConfirm = (event: IpcMainEvent, confirmed: boolean): void => {
      if (event.sender !== mainWindow.webContents) return
      finish(confirmed)
    }

    ipcMain.on('quit-confirm-result', handleQuitConfirm)
    mainWindow.webContents.once('destroyed', handleRendererUnavailable)
    const delay = context.showWindow()
    const showTimer = setTimeout(() => {
      const currentWindow = context.getMainWindow()
      if (
        !currentWindow ||
        currentWindow.isDestroyed() ||
        currentWindow.webContents.isDestroyed()
      ) {
        finish(true)
        return
      }
      currentWindow.webContents.send('show-quit-confirm')
    }, delay)
  })
}
