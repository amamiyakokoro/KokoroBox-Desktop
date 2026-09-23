import { tr } from '../../shared/i18n'
import { isGitHubTokenConfigured, setGitHubToken } from '../config/github-token'
import { isWebdavPasswordConfigured, setWebdavPassword } from '../config/webdav-password'
import {
  deriveStoredGistAgeRecipient,
  generateAndSaveGistAgeIdentity,
  getGistAgeIdentity,
  isGistAgeIdentityConfigured,
  setGistAgeIdentity
} from '../config/gist-age-identity'
import { app, ipcMain } from 'electron'
import {
  mihomoChangeProxy,
  mihomoCloseConnections,
  mihomoCloseConnection,
  mihomoGroupDelay,
  mihomoGroups,
  mihomoProxies,
  mihomoProxyDelay,
  mihomoProxyProviders,
  mihomoRuleProviders,
  mihomoRules,
  mihomoUnfixedProxy,
  mihomoUpdateProxyProviders,
  mihomoUpdateRuleProviders,
  mihomoUpgrade,
  mihomoUpgradeUI,
  mihomoUpgradeGeo,
  mihomoVersion,
  mihomoConfig,
  patchMihomoConfig,
  restartMihomoLogs,
  restartMihomoConnections,
  mihomoRulesDisable
} from '../core/mihomoApi'
import {
  checkAutoRun,
  disableAutoRun,
  enableAutoRun,
  openAutoRunSystemSettings
} from '../sys/autoRun'
import {
  getAppConfig,
  patchAppConfig,
  getControledMihomoConfig,
  patchControledMihomoConfig,
  getProfileConfig,
  getCurrentProfileItem,
  getProfileItem,
  addProfileItem,
  removeProfileItem,
  changeCurrentProfile,
  getProfileStr,
  getFileStr,
  getFilePreviewStr,
  setFileStr,
  saveFileStrWithElevation,
  setProfileStr,
  updateProfileItem,
  addKokoroProfile,
  clearKokoroProfiles,
  setProfileConfig,
  getOverrideConfig,
  setOverrideConfig,
  getOverrideItem,
  addOverrideItem,
  removeOverrideItem,
  getOverride,
  setOverride,
  updateOverrideItem
} from '../config'
import { quitWithoutCore, restartCore, startNetworkDetection, stopCore } from '../core/manager'
import { stopNetworkDetection } from '../core/network'
import {
  checkCorePermission,
  manualGrantCorePermition,
  revokeCorePermission
} from '../core/permission'
import { triggerSysProxy } from '../sys/sysproxy'
import { disableTerminalProxy } from '../sys/terminal-proxy'
import { checkUpdate, downloadAndInstallUpdate, cancelUpdate } from '../resolve/autoUpdater'
import { configureNativeMacOSUpdate } from '../resolve/macosNativeUpdater'
import {
  checkElevateTask,
  deleteElevateTask,
  getFilePath,
  openFile,
  readImageFileDataURL,
  readTextFile,
  relaunchWindowsElevated,
  relaunchWindowsUnelevated,
  resetAppConfig,
  setNativeTheme,
  setupFirewall
} from '../sys/misc'
import { listUwpLoopbackApps } from 'kokorobox-native'
import { canManageUwpLoopback, setUwpLoopbackExemption } from '../sys/uwp-loopback'
import {
  serviceStatus,
  installService,
  uninstallService,
  startService,
  stopService,
  initService,
  testServiceConnection,
  restartService,
  openServiceSystemSettings
} from '../service/manager'
import { patchCoreProfile } from '../service/api'
import { coreLogPath, findSystemMihomo, logDir } from './dirs'
import { systemCoreOnlyBuild } from '../../shared/build-flags'
import {
  getRuntimeConfig,
  getRuntimeConfigStr,
  getRawProfileStr,
  getCurrentProfileStr,
  getOverrideProfileStr
} from '../core/factory'
import { listWebdavBackups, webdavBackup, webdavDelete, webdavRestore } from '../resolve/backup'
import { getInterfaces } from '../sys/interface'
import {
  closeTrayIcon,
  copyEnv,
  setDockVisible,
  showTrayIcon,
  updateTrayIcon
} from '../resolve/tray'
import { registerShortcut } from '../resolve/shortcut'
import {
  closeMainWindow,
  confirmCloseMainWindow,
  mainWindow,
  setRendererHasUnsavedChanges,
  setNotQuitDialog,
  showMainWindow,
  triggerMainWindow
} from '..'
import path from 'path'
import v8 from 'v8'
import { getGistRawUrl } from '../resolve/gistApi'
import { getIconDataURL, getImageDataURL } from './icon'
import { startTrafficPresenter } from '../resolve/trafficPresenter'
import { closeFloatingWindow, showContextMenu, showFloatingWindow } from '../resolve/floatingWindow'
import { getAppName } from 'kokorobox-native'
import { showNotification } from './notification'
import { getUserAgent } from './userAgent'
import { appendAppLog, clearCachedMihomoLogs, getCachedMihomoLogs } from './log'
import { ageIdentityToRecipient, generateAgeKeyPair } from './age'
import {
  cancelKokoroLogin,
  getKokoroDefaultRules,
  getKokoroSession,
  replaceKokoroDefaultRules,
  revokeKokoroSession,
  startKokoroLogin
} from '../kokoro/client'
import { registerAppRoutingIpcHandlers } from '../app-routing/ipc'
import { resumeAppRoutingAfterServiceInitialization } from '../app-routing/manager'

function ipcErrorWrapper<T>( // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => T | Promise<T> // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (...args: any[]) => Promise<T | { invokeError: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (...args: any[]) => {
    try {
      return await fn(...args)
    } catch (e) {
      if (e && typeof e === 'object') {
        if ('message' in e) {
          return { invokeError: e.message }
        } else {
          return { invokeError: JSON.stringify(e) }
        }
      }
      if (e instanceof Error || typeof e === 'string') {
        return { invokeError: e }
      }
      return { invokeError: 'Unknown Error' }
    }
  }
}

async function startTrafficPresenterAndRestoreTray(): Promise<void> {
  await startTrafficPresenter()

  if (process.platform !== 'darwin') return
  const { disableTray = false } = await getAppConfig()
  if (disableTray) return

  // The traffic presenter owns a separate NSStatusItem. Reassert the Electron
  // tray after it starts or stops so the KokoroBox wind-chime item stays visible.
  await showTrayIcon()
  await updateTrayIcon()
}

async function patchAppConfigWithServiceSync(patch: Partial<AppConfig>): Promise<AppConfig> {
  if (Object.hasOwn(patch, 'githubToken')) {
    throw new Error('Use the GitHub token setting to update this credential')
  }
  if (Object.hasOwn(patch, 'webdavPassword')) {
    throw new Error('Use the WebDAV password setting to update this credential')
  }
  if (Object.hasOwn(patch, 'gistAgeIdentity')) {
    throw new Error('Use the Gist age private key setting to update this credential')
  }
  const nextConfig = await patchAppConfig(await validateSystemProxyServicePatch(patch))

  if (
    process.platform === 'darwin' &&
    app.isPackaged &&
    ('autoCheckUpdate' in patch || 'updateChannel' in patch)
  ) {
    try {
      configureNativeMacOSUpdate(
        nextConfig.updateChannel ?? 'stable',
        nextConfig.autoCheckUpdate ?? false
      )
    } catch (error) {
      void appendAppLog(`[Updater]: configure Sparkle failed, ${error}\n`)
    }
  }

  if (
    process.platform === 'linux' &&
    patch.sysProxy &&
    'terminalProxy' in patch.sysProxy &&
    nextConfig.sysProxy.terminalProxy === false
  ) {
    await disableTerminalProxy()
  }

  if (!('saveLogs' in patch || 'maxLogFileSizeMB' in patch)) {
    return nextConfig
  }

  const {
    corePermissionMode = 'elevated',
    saveLogs = true,
    maxLogFileSizeMB = 20
  } = await getAppConfig()
  if (corePermissionMode !== 'service') {
    return nextConfig
  }

  void patchCoreProfile({
    log_path: coreLogPath(),
    save_logs: saveLogs,
    max_log_file_size_mb: maxLogFileSizeMB
  }).catch((error) => {
    appendAppLog(`[Service]: sync core log config failed, ${error}\n`).catch(() => {})
  })

  return nextConfig
}

async function validateSystemProxyServicePatch(
  patch: Partial<AppConfig>
): Promise<Partial<AppConfig>> {
  if (patch.sysProxy?.enable !== true) {
    return patch
  }

  const status = await serviceStatus().catch(() => 'unknown' as const)
  if (status === 'running') {
    return patch
  }

  throw new Error(tr('The service may not be installed'))
}

export function registerIpcMainHandlers(): void {
  registerAppRoutingIpcHandlers()
  ipcMain.handle('mihomoVersion', ipcErrorWrapper(mihomoVersion))
  ipcMain.handle('mihomoConfig', ipcErrorWrapper(mihomoConfig))
  ipcMain.handle('mihomoCloseConnection', (_e, id) => ipcErrorWrapper(mihomoCloseConnection)(id))
  ipcMain.handle('mihomoCloseConnections', (_e, name) =>
    ipcErrorWrapper(mihomoCloseConnections)(name)
  )
  ipcMain.handle('mihomoRules', ipcErrorWrapper(mihomoRules))
  ipcMain.handle('mihomoProxies', ipcErrorWrapper(mihomoProxies))
  ipcMain.handle('mihomoGroups', ipcErrorWrapper(mihomoGroups))
  ipcMain.handle('mihomoProxyProviders', ipcErrorWrapper(mihomoProxyProviders))
  ipcMain.handle('mihomoUpdateProxyProviders', (_e, name) =>
    ipcErrorWrapper(mihomoUpdateProxyProviders)(name)
  )
  ipcMain.handle('mihomoRuleProviders', ipcErrorWrapper(mihomoRuleProviders))
  ipcMain.handle('mihomoUpdateRuleProviders', (_e, name) =>
    ipcErrorWrapper(mihomoUpdateRuleProviders)(name)
  )
  ipcMain.handle('mihomoChangeProxy', (_e, group, proxy) =>
    ipcErrorWrapper(mihomoChangeProxy)(group, proxy)
  )
  ipcMain.handle('mihomoUnfixedProxy', (_e, group) => ipcErrorWrapper(mihomoUnfixedProxy)(group))
  ipcMain.handle('mihomoUpgradeGeo', ipcErrorWrapper(mihomoUpgradeGeo))
  ipcMain.handle('mihomoUpgradeUI', ipcErrorWrapper(mihomoUpgradeUI))
  if (!systemCoreOnlyBuild) {
    ipcMain.handle('mihomoUpgrade', (_e, channel) => ipcErrorWrapper(mihomoUpgrade)(channel))
  }
  ipcMain.handle('mihomoProxyDelay', (_e, proxy, url, provider) =>
    ipcErrorWrapper(mihomoProxyDelay)(proxy, url, provider)
  )
  ipcMain.handle('mihomoGroupDelay', (_e, group, url) =>
    ipcErrorWrapper(mihomoGroupDelay)(group, url)
  )
  ipcMain.handle('mihomoRulesDisable', (_e, rules) => ipcErrorWrapper(mihomoRulesDisable)(rules))
  ipcMain.handle('patchMihomoConfig', (_e, patch) => ipcErrorWrapper(patchMihomoConfig)(patch))
  ipcMain.handle('restartMihomoLogs', ipcErrorWrapper(restartMihomoLogs))
  ipcMain.handle('checkAutoRun', ipcErrorWrapper(checkAutoRun))
  ipcMain.handle('enableAutoRun', ipcErrorWrapper(enableAutoRun))
  ipcMain.handle('disableAutoRun', ipcErrorWrapper(disableAutoRun))
  ipcMain.handle('openAutoRunSystemSettings', ipcErrorWrapper(openAutoRunSystemSettings))
  ipcMain.handle('getAppConfig', (_e, force) =>
    ipcErrorWrapper(async () => {
      const {
        githubToken: _githubToken,
        webdavPassword: _webdavPassword,
        gistAgeIdentity: _gistAgeIdentity,
        ...config
      } = await getAppConfig(force)
      return config
    })()
  )
  ipcMain.handle('getGitHubTokenConfigured', ipcErrorWrapper(isGitHubTokenConfigured))
  ipcMain.handle('setGitHubToken', (_e, token) => ipcErrorWrapper(setGitHubToken)(token))
  ipcMain.handle('getWebdavPasswordConfigured', ipcErrorWrapper(isWebdavPasswordConfigured))
  ipcMain.handle('setWebdavPassword', (_e, password) =>
    ipcErrorWrapper(setWebdavPassword)(password)
  )
  ipcMain.handle('getGistAgeIdentityConfigured', ipcErrorWrapper(isGistAgeIdentityConfigured))
  ipcMain.handle('revealGistAgeIdentity', ipcErrorWrapper(getGistAgeIdentity))
  ipcMain.handle('setGistAgeIdentity', (_e, identity) =>
    ipcErrorWrapper(setGistAgeIdentity)(identity)
  )
  ipcMain.handle('generateAndSaveGistAgeIdentity', ipcErrorWrapper(generateAndSaveGistAgeIdentity))
  ipcMain.handle('deriveStoredGistAgeRecipient', ipcErrorWrapper(deriveStoredGistAgeRecipient))
  ipcMain.handle('getCachedMihomoLogs', () => getCachedMihomoLogs())
  ipcMain.handle('clearCachedMihomoLogs', () => clearCachedMihomoLogs())
  ipcMain.handle('patchAppConfig', (_e, config) =>
    ipcErrorWrapper(async () => {
      const {
        githubToken: _githubToken,
        webdavPassword: _webdavPassword,
        gistAgeIdentity: _gistAgeIdentity,
        ...nextConfig
      } = await patchAppConfigWithServiceSync(config)
      return nextConfig
    })()
  )
  ipcMain.handle('getControledMihomoConfig', (_e, force) =>
    ipcErrorWrapper(getControledMihomoConfig)(force)
  )
  ipcMain.handle('patchControledMihomoConfig', (_e, config) =>
    ipcErrorWrapper(patchControledMihomoConfig)(config)
  )
  ipcMain.handle('getProfileConfig', (_e, force) => ipcErrorWrapper(getProfileConfig)(force))
  ipcMain.handle('setProfileConfig', (_e, config) => ipcErrorWrapper(setProfileConfig)(config))
  ipcMain.handle('getCurrentProfileItem', ipcErrorWrapper(getCurrentProfileItem))
  ipcMain.handle('getProfileItem', (_e, id) => ipcErrorWrapper(getProfileItem)(id))
  ipcMain.handle('getProfileStr', (_e, id) => ipcErrorWrapper(getProfileStr)(id))
  ipcMain.handle('getFileStr', (_e, path, ageSecretKey) =>
    ipcErrorWrapper(getFileStr)(path, ageSecretKey)
  )
  ipcMain.handle('getFilePreviewStr', (_e, path, format) =>
    ipcErrorWrapper(getFilePreviewStr)(path, format)
  )
  ipcMain.handle('setFileStr', (_e, path, str) => ipcErrorWrapper(setFileStr)(path, str))
  if (!systemCoreOnlyBuild) {
    ipcMain.handle('saveFileStrWithElevation', (_e, path, str) =>
      ipcErrorWrapper(saveFileStrWithElevation)(path, str)
    )
  }
  ipcMain.handle('setProfileStr', (_e, id, str) => ipcErrorWrapper(setProfileStr)(id, str))
  ipcMain.handle('updateProfileItem', (_e, item) => ipcErrorWrapper(updateProfileItem)(item))
  ipcMain.handle('changeCurrentProfile', (_e, id) => ipcErrorWrapper(changeCurrentProfile)(id))
  ipcMain.handle('addProfileItem', (_e, item) => ipcErrorWrapper(addProfileItem)(item))
  ipcMain.handle('removeProfileItem', (_e, id) => ipcErrorWrapper(removeProfileItem)(id))
  ipcMain.handle('getKokoroSession', () => ipcErrorWrapper(getKokoroSession)())
  ipcMain.handle('startKokoroLogin', () => ipcErrorWrapper(startKokoroLogin)())
  ipcMain.handle('cancelKokoroLogin', () => ipcErrorWrapper(cancelKokoroLogin)())
  ipcMain.handle('getKokoroDefaultRules', () => ipcErrorWrapper(getKokoroDefaultRules)())
  ipcMain.handle('replaceKokoroDefaultRules', (_e, expectedRevision, rules) =>
    ipcErrorWrapper(replaceKokoroDefaultRules)(expectedRevision, rules)
  )
  ipcMain.handle('addKokoroProfile', (_e, settings) => ipcErrorWrapper(addKokoroProfile)(settings))
  ipcMain.handle('revokeKokoroSession', () =>
    ipcErrorWrapper(async () => {
      await revokeKokoroSession()
      await clearKokoroProfiles()
      mainWindow?.webContents.send('profileConfigUpdated')
    })()
  )
  ipcMain.handle('getOverrideConfig', (_e, force) => ipcErrorWrapper(getOverrideConfig)(force))
  ipcMain.handle('setOverrideConfig', (_e, config) => ipcErrorWrapper(setOverrideConfig)(config))
  ipcMain.handle('getOverrideItem', (_e, id) => ipcErrorWrapper(getOverrideItem)(id))
  ipcMain.handle('addOverrideItem', (_e, item) => ipcErrorWrapper(addOverrideItem)(item))
  ipcMain.handle('removeOverrideItem', (_e, id) => ipcErrorWrapper(removeOverrideItem)(id))
  ipcMain.handle('updateOverrideItem', (_e, item) => ipcErrorWrapper(updateOverrideItem)(item))
  ipcMain.handle('getOverride', (_e, id, ext) => ipcErrorWrapper(getOverride)(id, ext))
  ipcMain.handle('setOverride', (_e, id, ext, str) => ipcErrorWrapper(setOverride)(id, ext, str))
  ipcMain.handle('restartCore', ipcErrorWrapper(restartCore))
  ipcMain.handle('stopCore', ipcErrorWrapper(stopCore))
  ipcMain.handle('restartMihomoConnections', ipcErrorWrapper(restartMihomoConnections))
  ipcMain.handle('startMonitor', () => ipcErrorWrapper(startTrafficPresenterAndRestoreTray)())
  ipcMain.handle('triggerSysProxy', (_e, enable, onlyActiveDevice, useRegistry) =>
    ipcErrorWrapper(triggerSysProxy)(enable, onlyActiveDevice, useRegistry)
  )
  if (!systemCoreOnlyBuild) {
    ipcMain.handle('manualGrantCorePermition', (_e, cores?: ('mihomo' | 'mihomo-alpha')[]) =>
      ipcErrorWrapper(manualGrantCorePermition)(cores)
    )
    ipcMain.handle('checkCorePermission', () => ipcErrorWrapper(checkCorePermission)())
    ipcMain.handle('revokeCorePermission', (_e, cores?: ('mihomo' | 'mihomo-alpha')[]) =>
      ipcErrorWrapper(revokeCorePermission)(cores)
    )
    ipcMain.handle('checkElevateTask', () => ipcErrorWrapper(checkElevateTask)())
    ipcMain.handle('deleteElevateTask', () => ipcErrorWrapper(deleteElevateTask)())
    ipcMain.handle('relaunchWindowsElevated', () => ipcErrorWrapper(relaunchWindowsElevated)())
    ipcMain.handle('relaunchWindowsUnelevated', () => ipcErrorWrapper(relaunchWindowsUnelevated)())
  }
  ipcMain.handle('serviceStatus', () => ipcErrorWrapper(serviceStatus)())
  ipcMain.handle('testServiceConnection', () => ipcErrorWrapper(testServiceConnection)())
  ipcMain.handle('openServiceSystemSettings', () => ipcErrorWrapper(openServiceSystemSettings)())
  // Only an explicit renderer action may authorize replacement of stale
  // service credentials. Automatic startup recovery calls initService()
  // directly and therefore never opens an administrator prompt.
  ipcMain.handle('initService', () =>
    ipcErrorWrapper(async () => {
      await initService(true)
      resumeAppRoutingAfterServiceInitialization()
    })()
  )
  if (!systemCoreOnlyBuild) {
    ipcMain.handle('installService', () => ipcErrorWrapper(installService)())
    ipcMain.handle('uninstallService', () => ipcErrorWrapper(uninstallService)())
    ipcMain.handle('startService', () => ipcErrorWrapper(startService)())
    ipcMain.handle('restartService', () => ipcErrorWrapper(restartService)())
    ipcMain.handle('stopService', () => ipcErrorWrapper(stopService)())
  }
  ipcMain.handle('findSystemMihomo', () => findSystemMihomo())
  ipcMain.handle('getFilePath', (_e, ext, title, filterName) => getFilePath(ext, title, filterName))
  ipcMain.handle('readTextFile', (_e, filePath) => ipcErrorWrapper(readTextFile)(filePath))
  ipcMain.handle('readImageFileDataURL', (_e, filePath) =>
    ipcErrorWrapper(readImageFileDataURL)(filePath)
  )
  ipcMain.handle('getRuntimeConfigStr', ipcErrorWrapper(getRuntimeConfigStr))
  ipcMain.handle('getRawProfileStr', ipcErrorWrapper(getRawProfileStr))
  ipcMain.handle('getCurrentProfileStr', ipcErrorWrapper(getCurrentProfileStr))
  ipcMain.handle('getOverrideProfileStr', ipcErrorWrapper(getOverrideProfileStr))
  ipcMain.handle('getRuntimeConfig', ipcErrorWrapper(getRuntimeConfig))
  ipcMain.handle('downloadAndInstallUpdate', (_e, version, tag) =>
    ipcErrorWrapper(downloadAndInstallUpdate)(version, tag)
  )
  ipcMain.handle('checkUpdate', ipcErrorWrapper(checkUpdate))
  ipcMain.handle('cancelUpdate', ipcErrorWrapper(cancelUpdate))
  ipcMain.handle('getVersion', () => app.getVersion())
  ipcMain.handle('platform', () => process.platform)
  ipcMain.handle('listUwpLoopbackApps', ipcErrorWrapper(listUwpLoopbackApps))
  ipcMain.handle('canManageUwpLoopback', ipcErrorWrapper(canManageUwpLoopback))
  ipcMain.handle('setUwpLoopbackExemption', ipcErrorWrapper(setUwpLoopbackExemption))
  ipcMain.handle('setupFirewall', ipcErrorWrapper(setupFirewall))
  ipcMain.handle('getInterfaces', getInterfaces)
  ipcMain.handle('webdavBackup', ipcErrorWrapper(webdavBackup))
  ipcMain.handle('webdavRestore', (_e, filename) => ipcErrorWrapper(webdavRestore)(filename))
  ipcMain.handle('listWebdavBackups', ipcErrorWrapper(listWebdavBackups))
  ipcMain.handle('webdavDelete', (_e, filename) => ipcErrorWrapper(webdavDelete)(filename))
  ipcMain.handle('registerShortcut', (_e, oldShortcut, newShortcut, action) =>
    ipcErrorWrapper(registerShortcut)(oldShortcut, newShortcut, action)
  )
  ipcMain.handle('getGistRawUrl', ipcErrorWrapper(getGistRawUrl))
  ipcMain.handle('setNativeTheme', (_e, theme) => {
    setNativeTheme(theme)
  })
  ipcMain.handle('setTitleBarOverlay', (_e, overlay) =>
    ipcErrorWrapper(async (overlay): Promise<void> => {
      if (typeof mainWindow?.setTitleBarOverlay === 'function') {
        mainWindow.setTitleBarOverlay(overlay)
      }
    })(overlay)
  )
  ipcMain.handle('setAlwaysOnTop', (_e, alwaysOnTop) => {
    mainWindow?.setAlwaysOnTop(alwaysOnTop)
  })
  ipcMain.handle('isAlwaysOnTop', () => {
    return mainWindow?.isAlwaysOnTop()
  })
  ipcMain.handle('showTrayIcon', () => ipcErrorWrapper(showTrayIcon)())
  ipcMain.handle('closeTrayIcon', () => ipcErrorWrapper(closeTrayIcon)())
  ipcMain.handle('updateTrayIcon', () => ipcErrorWrapper(updateTrayIcon)())
  ipcMain.handle('setDockVisible', (_e, visible: boolean) => setDockVisible(visible))
  ipcMain.handle('showMainWindow', showMainWindow)
  ipcMain.handle('closeMainWindow', closeMainWindow)
  ipcMain.handle('confirmCloseMainWindow', confirmCloseMainWindow)
  ipcMain.handle('setRendererHasUnsavedChanges', (_event, value: boolean) => {
    setRendererHasUnsavedChanges(value)
  })
  ipcMain.handle('triggerMainWindow', triggerMainWindow)
  ipcMain.handle('showFloatingWindow', () => ipcErrorWrapper(showFloatingWindow)())
  ipcMain.handle('closeFloatingWindow', () => ipcErrorWrapper(closeFloatingWindow)())
  ipcMain.handle('showContextMenu', () => ipcErrorWrapper(showContextMenu)())
  ipcMain.handle('openFile', (_e, type, id, ext) => openFile(type, id, ext))
  ipcMain.handle('openDevTools', () => {
    mainWindow?.webContents.openDevTools()
  })
  ipcMain.handle('createHeapSnapshot', () => {
    return v8.writeHeapSnapshot(path.join(logDir(), `${Date.now()}.heapsnapshot`))
  })
  ipcMain.handle('getUserAgent', () => ipcErrorWrapper(getUserAgent)())
  ipcMain.handle('generateAgeKeyPair', () => ipcErrorWrapper(generateAgeKeyPair)())
  ipcMain.handle('ageIdentityToRecipient', (_e, identity) =>
    ipcErrorWrapper(ageIdentityToRecipient)(identity)
  )
  ipcMain.handle('getAppName', (_e, appPath) => ipcErrorWrapper(getAppName)(appPath))
  ipcMain.handle('getImageDataURL', (_e, url) => ipcErrorWrapper(getImageDataURL)(url))
  ipcMain.handle('getIconDataURL', (_e, appPath) => ipcErrorWrapper(getIconDataURL)(appPath))
  ipcMain.handle('copyEnv', (_e, type) => ipcErrorWrapper(copyEnv)(type))
  ipcMain.handle('alert', (_e, msg) => {
    void showNotification({ title: 'KokoroBox', body: msg, variant: 'danger' })
  })
  ipcMain.handle('resetAppConfig', resetAppConfig)
  ipcMain.handle('relaunchApp', () => {
    setNotQuitDialog()
    app.relaunch()
    app.quit()
  })
  ipcMain.handle('quitWithoutCore', ipcErrorWrapper(quitWithoutCore))
  ipcMain.handle('startNetworkDetection', ipcErrorWrapper(startNetworkDetection))
  ipcMain.handle('stopNetworkDetection', ipcErrorWrapper(stopNetworkDetection))
  ipcMain.handle('quitApp', () => app.quit())
  ipcMain.handle('notDialogQuit', () => {
    setNotQuitDialog()
    app.quit()
  })
}
