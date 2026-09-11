import { getLocale, resolveLocale, setLocale, tr } from '../shared/i18n'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcMainHandlers } from './utils/ipc'
import { app, shell, BrowserWindow, Menu, type IpcMainEvent } from 'electron'
import { getAppConfig } from './config'
import { quitWithoutCore, startCore, stopCore } from './core/manager'
import { stopNetworkDetection } from './core/network'
import { disableSysProxySync, triggerSysProxy } from './sys/sysproxy'
import icon from '../../resources/icon.png?asset'
import { createTray } from './resolve/tray'
import { createApplicationMenu } from './resolve/menu'
import { init } from './utils/init'
import { join } from 'path'
import { initShortcut } from './resolve/shortcut'
import { initProfileUpdater } from './core/profileUpdater'
import { startMonitor } from './resolve/trafficMonitor'
import { showFloatingWindow } from './resolve/floatingWindow'
import { getAppConfigSync } from './config/app'
import { createMainWindowStateManager } from './resolve/windowState'
import { isHttpUrl } from './utils/url'
import { applyWindowsGpuWorkaround, useLinuxCustomRelaunch } from './sys/startup'
import { handleDeepLink } from './resolve/deepLink'
import { createDeepLinkInbox, takeInitialDeepLinks } from './resolve/deepLinkInbox'
import { initAppQuitLifecycle, isAppQuitting } from './resolve/appLifecycle'
import { showNotification } from './utils/notification'
import { appendAppLog } from './utils/log'
import { migrateLegacyWindowsTasks } from './sys/autoRun'
import { createPendingKokoroRelayProof } from './kokoro/client'
import {
  forwardKokoroCallback,
  kokoroCallbackRelayPath,
  startKokoroCallbackRelay,
  type KokoroCallbackRelay
} from './resolve/kokoroCallbackRelay'
import { isKokoroURI } from './kokoro/oauth'
import { initializeAppRouting } from './app-routing/manager'
import {
  installEarlyTlsDisconnectRecovery,
  isExpectedNetworkTransition
} from './utils/earlyTlsDisconnect'
import { migrateUserDataDirectory } from './utils/userDataMigration'
import { getWindowsRelaunchWaitPid } from '../shared/windows-relaunch'

export { setNotQuitDialog } from './resolve/appLifecycle'

// The release workflow executes this after code signing. It must run before Electron acquires
// the single-instance lock or starts any service so macOS AMFI launch-policy failures are caught.
if (process.argv.includes('--kokorobox-amfi-probe')) {
  process.stdout.write('kokorobox-amfi-probe-ok\n')
  app.exit(0)
}

let quitTimeout: NodeJS.Timeout | null = null
export let mainWindow: BrowserWindow | null = null
let isCreatingWindow = false
let windowShown = false
let createWindowPromiseResolve: (() => void) | null = null
let createWindowPromise: Promise<void> | null = null
let initialWindowDisplayPromiseResolve: (() => void) | null = null
const initialWindowDisplayPromise = new Promise<void>((resolve) => {
  initialWindowDisplayPromiseResolve = resolve
})

function waitForInitialContent(window: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    const { webContents } = window
    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      webContents.off('ipc-message', onIpcMessage)
      window.off('closed', finish)
      resolve()
    }
    const onIpcMessage = (_event: IpcMainEvent, channel: string): void => {
      if (channel === 'renderer-content-ready') finish()
    }
    const timeout = setTimeout(finish, 5000)
    webContents.on('ipc-message', onIpcMessage)
    window.once('closed', finish)
  })
}

async function scheduleLightweightMode(): Promise<void> {
  const {
    autoLightweight = false,
    autoLightweightDelay = 60,
    autoLightweightMode = 'core'
  } = await getAppConfig()

  if (!autoLightweight) return

  if (quitTimeout) {
    clearTimeout(quitTimeout)
  }

  const enterLightweightMode = async (): Promise<void> => {
    if (autoLightweightMode === 'core') {
      await quitWithoutCore()
    } else if (autoLightweightMode === 'tray') {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.destroy()
        if (process.platform === 'darwin' && app.dock) {
          app.dock.hide()
        }
      }
    }
  }

  quitTimeout = setTimeout(enterLightweightMode, autoLightweightDelay * 1000)
}

// This must happen before configuration, credentials, or the single-instance lock
// can read userData.  On an upgrade we atomically move the old Sparkle directory;
// conflicts intentionally keep using the legacy directory rather than merging data.
const userDataMigration = migrateUserDataDirectory(app.getPath('appData'))
app.setPath('userData', userDataMigration.userDataPath)
if (userDataMigration.status === 'conflict' || userDataMigration.status === 'failed') {
  console.warn(
    `[KokoroBox] user-data migration ${userDataMigration.status}; continuing with ${userDataMigration.legacyPath}${userDataMigration.error ? `: ${userDataMigration.error.message}` : ''}`
  )
}
const syncConfig = getAppConfigSync()
setLocale(resolveLocale(syncConfig.language, app.getPreferredSystemLanguages()))
app.setName('KokoroBox')

function exitApp(): void {
  disableSysProxySync()
  app.exit()
}

function clearLightweightTimeout(): void {
  if (quitTimeout) {
    clearTimeout(quitTimeout)
    quitTimeout = null
  }
}

function runStartupTask(name: string, task: Promise<unknown>): void {
  task.catch((error) => {
    appendAppLog(`[App]: startup task ${name} failed, ${error}\n`).catch(() => {})
  })
}

const reportedEarlyTlsDisconnects = new WeakSet<Error>()
let lastEarlyTlsDisconnectNotification = 0
installEarlyTlsDisconnectRecovery((error, origin) => {
  if (reportedEarlyTlsDisconnects.has(error)) return
  reportedEarlyTlsDisconnects.add(error)

  const expectedNetworkTransition = isExpectedNetworkTransition()

  runStartupTask(
    'early TLS disconnect logging',
    appendAppLog(
      `[App]: recovered ${expectedNetworkTransition ? 'expected network transition ' : ''}${origin}, ${error.stack || error.message}\n`
    )
  )

  if (expectedNetworkTransition) return

  const now = Date.now()
  if (app.isReady() && now - lastEarlyTlsDisconnectNotification >= 30_000) {
    lastEarlyTlsDisconnectNotification = now
    runStartupTask(
      'early TLS disconnect notification',
      showNotification({
        title: tr('请求失败'),
        body: error.message,
        variant: 'warning'
      })
    )
  }
})

function showWindow(): number {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    } else if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
    mainWindow.focusOnWebView()
    mainWindow.setAlwaysOnTop(true, 'pop-up-menu')
    mainWindow.focus()
    mainWindow.setAlwaysOnTop(false)

    if (!mainWindow.isMinimized()) {
      return 100
    }
  }
  return 500
}

// GPU switches must be applied before app readiness, including while a Windows callback
// process authenticates the elevated primary instance.
applyWindowsGpuWorkaround()
if (syncConfig.disableGPU) app.disableHardwareAcceleration()

const windowsKokoroCallback =
  process.platform === 'win32' ? process.argv.find(isKokoroURI) : undefined
const windowsRelaunchWaitPid =
  process.platform === 'win32' ? getWindowsRelaunchWaitPid(process.argv) : undefined

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // Windows can deny querying a process at another integrity level. In that
    // case it is still alive; ESRCH means the previous instance has exited.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function waitForRelaunchParent(pid: number): Promise<void> {
  while (isProcessRunning(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

if (windowsKokoroCallback) {
  // A browser starts protocol handlers without elevation. Try the authenticated relay before
  // Electron's single-instance handoff, which Windows can block across integrity levels.
  void forwardKokoroCallback(
    kokoroCallbackRelayPath(app.getPath('userData')),
    windowsKokoroCallback
  ).then((forwarded) => {
    if (forwarded) app.quit()
    else requestPrimaryInstance()
  })
} else if (windowsRelaunchWaitPid && windowsRelaunchWaitPid !== process.pid) {
  // Do not initialize the replacement while the previous integrity-level
  // instance still owns Mihomo's controller pipe and other shared resources.
  void waitForRelaunchParent(windowsRelaunchWaitPid).then(requestPrimaryInstance)
} else {
  requestPrimaryInstance()
}

function requestPrimaryInstance(): void {
  const initialDeepLinks = takeInitialDeepLinks(process.argv)
  const gotTheLock = app.requestSingleInstanceLock({ deepLinks: initialDeepLinks })
  if (!gotTheLock) {
    app.quit()
    return
  }
  startPrimaryInstance(initialDeepLinks)
}

function startPrimaryInstance(initialDeepLinks: string[]): void {
  let initialized = false
  const inbox = createDeepLinkInbox(
    (url) => handleDeepLink(url, { getMainWindow: () => mainWindow, createWindow, showWindow }),
    () => {
      void showNotification({ title: tr('Kokoro 登录失败'), variant: 'danger' })
    }
  )
  // Register before readiness; macOS can deliver open-url during cold startup.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    inbox.receive(url)
  })
  app.on('second-instance', (_event, commandline, _workingDirectory, additionalData) => {
    for (const url of takeInitialDeepLinks(commandline)) inbox.receive(url)
    const transferredLinks = (additionalData as { deepLinks?: unknown } | undefined)?.deepLinks
    if (Array.isArray(transferredLinks)) {
      for (const url of transferredLinks) {
        if (typeof url === 'string') inbox.receive(url)
      }
    }
    if (initialized) void showMainWindow()
  })
  for (const url of initialDeepLinks) inbox.receive(url)

  let callbackRelay: KokoroCallbackRelay | undefined
  let quitting = false
  if (process.platform === 'win32') {
    app.once('will-quit', () => {
      quitting = true
      if (callbackRelay) void callbackRelay.close()
    })
  }

  useLinuxCustomRelaunch()
  const initPromise = init()

  initAppQuitLifecycle({
    getMainWindow: () => mainWindow,
    showWindow,
    clearLightweightTimeout,
    exitApp
  })

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  runStartupTask(
    'application initialization',
    app.whenReady().then(async () => {
      // Set app user model id for windows
      electronApp.setAppUserModelId('com.amamiyakokoro.app')
      if (process.platform === 'win32') {
        try {
          callbackRelay = await startKokoroCallbackRelay(
            kokoroCallbackRelayPath(app.getPath('userData')),
            createPendingKokoroRelayProof,
            inbox.receive
          )
          if (quitting) {
            await callbackRelay.close()
            return
          }
        } catch {
          void appendAppLog('[App]: Kokoro callback relay unavailable\n')
        }
      }
      let appConfig: AppConfig
      try {
        appConfig = await initPromise
      } catch (e) {
        void showNotification({ title: tr('应用初始化失败'), body: `${e}`, variant: 'danger' })
        app.quit()
        return
      }

      // Default open or close DevTools by F12 in development
      // and ignore CommandOrControl + R in production.
      // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
      app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
      })
      const { showFloatingWindow: showFloating = false, disableTray = false } = appConfig
      registerIpcMainHandlers()
      runStartupTask('Windows scheduled task migration', migrateLegacyWindowsTasks())
      runStartupTask('Windows application routing', initializeAppRouting())

      const createWindowPromise = createWindow(appConfig)

      let coreStarted = false

      const coreStartPromise = (async (): Promise<void> => {
        try {
          if (is.dev) {
            await initialWindowDisplayPromise
          }
          const [startPromise] = await startCore()
          runStartupTask('profile updater', startPromise.then(initProfileUpdater))
          coreStarted = true
        } catch (e) {
          void showNotification({ title: tr('内核启动出错'), body: `${e}`, variant: 'danger' })
        }
      })()

      runStartupTask('traffic monitor', startMonitor())

      await createWindowPromise

      initialized = true
      inbox.start()

      const uiTasks: Promise<void>[] = [initShortcut()]

      if (showFloating) {
        uiTasks.push(Promise.resolve(showFloatingWindow()))
      }
      if (!disableTray) {
        uiTasks.push(createTray())
      }

      runStartupTask('ui extras', Promise.all(uiTasks))
      runStartupTask(
        'core startup notification',
        coreStartPromise.then(() => {
          if (coreStarted) {
            mainWindow?.webContents.send('core-started')
          }
        })
      )

      app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        runStartupTask('show main window', showMainWindow())
      })
    })
  )
}

export async function createWindow(appConfig?: AppConfig): Promise<void> {
  if (isCreatingWindow) {
    if (createWindowPromise) {
      await createWindowPromise
    }
    return
  }
  isCreatingWindow = true
  createWindowPromise = new Promise<void>((resolve) => {
    createWindowPromiseResolve = resolve
  })
  try {
    const config = appConfig ?? (await getAppConfig())
    const { useWindowFrame = false, enableWindowDrag = false, silentStart = false } = config
    const useNativeWindowFrame = useWindowFrame && !enableWindowDrag
    const [windowStateManager] = await Promise.all([
      Promise.resolve(createMainWindowStateManager()),
      process.platform === 'darwin'
        ? createApplicationMenu()
        : Promise.resolve(Menu.setApplicationMenu(null))
    ])
    const windowState = windowStateManager.state
    mainWindow = new BrowserWindow({
      minWidth: 800,
      minHeight: 600,
      width: windowState.width,
      height: windowState.height,
      x: windowState.x,
      y: windowState.y,
      show: false,
      frame: useNativeWindowFrame,
      fullscreenable: false,
      titleBarStyle: useNativeWindowFrame ? 'default' : 'hidden',
      titleBarOverlay: useWindowFrame
        ? false
        : {
            height: 49
          },
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? { icon: icon } : {}),
      webPreferences: {
        additionalArguments: [`--kokorobox-locale=${getLocale()}`],
        preload: join(__dirname, '../preload/index.js'),
        spellcheck: false,
        sandbox: false,
        ...(is.dev ? { webSecurity: false } : {})
      }
    })
    windowStateManager.attach(mainWindow)
    const initialContentPromise = waitForInitialContent(mainWindow)
    let mainFrameLoadFailureCount = 0
    let mainFrameLoadRetryTimer: NodeJS.Timeout | null = null
    mainWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return

        mainFrameLoadFailureCount += 1
        void appendAppLog(
          `[Window]: main frame load failed (${errorCode}, attempt ${mainFrameLoadFailureCount}): ${errorDescription}; ${validatedURL}\n`
        )

        // A permanently broken local renderer must not turn into an unbounded
        // visible reload loop. Retry two times with a short backoff, then keep
        // the window stable so its diagnostics remain inspectable.
        if (mainFrameLoadFailureCount > 2 || mainFrameLoadRetryTimer) return
        mainFrameLoadRetryTimer = setTimeout(() => {
          mainFrameLoadRetryTimer = null
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload()
        }, mainFrameLoadFailureCount * 500)
      }
    )
    const resetMainFrameLoadFailures = (): void => {
      mainFrameLoadFailureCount = 0
      if (mainFrameLoadRetryTimer) {
        clearTimeout(mainFrameLoadRetryTimer)
        mainFrameLoadRetryTimer = null
      }
    }
    const onRendererIpcMessage = (_event: IpcMainEvent, channel: string): void => {
      if (channel === 'renderer-content-ready') resetMainFrameLoadFailures()
    }
    mainWindow.webContents.on('ipc-message', onRendererIpcMessage)
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      void appendAppLog(
        `[Window]: renderer process exited (${details.reason}, code ${details.exitCode})\n`
      )
    })

    mainWindow.on('close', async (event) => {
      // Normal window closes hide KokoroBox in the tray. An intentional app
      // quit must be allowed through so Electron can shut down cleanly.
      if (isAppQuitting()) return
      event.preventDefault()
      mainWindow?.hide()
      if (windowShown) {
        await scheduleLightweightMode()
      }
    })

    mainWindow.on('closed', () => {
      if (mainFrameLoadRetryTimer) clearTimeout(mainFrameLoadRetryTimer)
      mainWindow?.webContents.off('ipc-message', onRendererIpcMessage)
      mainWindow = null
    })

    mainWindow.on('session-end', async () => {
      stopNetworkDetection()
      disableSysProxySync(true)
      await triggerSysProxy(false, false, true)
      await stopCore()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
      if (isHttpUrl(details.url)) {
        void shell.openExternal(details.url)
      }
      return { action: 'deny' }
    })
    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
    await initialContentPromise
    if (!mainWindow) return

    if (!silentStart) {
      clearLightweightTimeout()
      windowShown = true
      mainWindow.show()
      mainWindow.focusOnWebView()
    } else {
      await scheduleLightweightMode()
    }
    initialWindowDisplayPromiseResolve?.()
    initialWindowDisplayPromiseResolve = null
  } finally {
    isCreatingWindow = false
    if (createWindowPromiseResolve) {
      createWindowPromiseResolve()
      createWindowPromiseResolve = null
    }
    createWindowPromise = null
  }
}

export async function triggerMainWindow(): Promise<void> {
  if (mainWindow && mainWindow.isVisible()) {
    closeMainWindow()
  } else {
    await showMainWindow()
  }
}

export async function showMainWindow(): Promise<void> {
  if (quitTimeout) {
    clearTimeout(quitTimeout)
  }
  if (process.platform === 'darwin' && app.dock) {
    const { useDockIcon = true } = await getAppConfig()
    if (!useDockIcon) {
      app.dock.hide()
    }
  }
  if (mainWindow) {
    windowShown = true
    mainWindow.show()
    mainWindow.focusOnWebView()
  } else {
    await createWindow()
    if (mainWindow !== null) {
      windowShown = true
      ;(mainWindow as BrowserWindow).show()
      ;(mainWindow as BrowserWindow).focusOnWebView()
    }
  }
}

export function closeMainWindow(): void {
  if (mainWindow) {
    mainWindow.close()
  }
}
