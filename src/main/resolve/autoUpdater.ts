import { tr } from '../../shared/i18n'
import axios, { AxiosRequestConfig, CancelTokenSource } from 'axios'
import { parseYaml } from '../utils/yaml'
import { app, shell } from 'electron'
import { getAppConfig, getControledMihomoConfig } from '../config'
import { getGitHubToken } from '../config/github-token'
import { dataDir, exePath, isPortable, resourcesFilesDir, servicePath } from '../utils/dirs'
import { copyFile, rm, writeFile, readFile, statfs } from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'
import os from 'os'
import { setNotQuitDialog, mainWindow } from '..'
import { triggerSysProxy } from '../sys/sysproxy'
import { serviceStatus, stopService } from '../service/manager'
import {
  clearAppUpdateServiceFallbackPause,
  pauseServiceFallbackForAppUpdate
} from '../service/fallback'
import { appendAppLog } from '../utils/log'
import { systemCoreOnlyBuild } from '../../shared/build-flags'
import { showNativeMacOSUpdate } from './macosNativeUpdater'
import * as native from 'kokorobox-native'

let downloadCancelToken: CancelTokenSource | null = null
const WINDOWS_INSTALLER_MIN_TEMP_SPACE_BYTES = 1024 * 1024 * 1024
const UPDATE_MANIFEST_URLS: Record<AppUpdateChannel, string> = {
  stable: 'https://github.com/amamiyakokoro/KokoroBox-Desktop/releases/latest/download/latest.yml',
  rolling: 'https://github.com/amamiyakokoro/KokoroBox-Desktop/releases/download/rolling/latest.yml'
}

function getGitHubAuthHeaders(token?: string): Record<string, string> {
  const normalizedToken = token?.trim()
  return normalizedToken ? { Authorization: `Bearer ${normalizedToken}` } : {}
}

function resolveReleaseTag(version: string, tag?: string): string {
  if (/^\d+\.\d+\.\d+-rolling-[0-9a-f]{7}$/.test(version)) {
    if (tag && tag !== 'rolling')
      throw new Error(tr('The update version does not match its release tag'))
    return 'rolling'
  }
  if (!/^\d+\.\d+\.\d+(?:-\d+)?$/.test(version)) {
    throw new Error(tr('Invalid update version format'))
  }
  if (tag && ![version, `v${version}`].includes(tag)) {
    throw new Error(tr('The update version does not match its release tag'))
  }
  return tag ?? version
}

async function ensureFreeSpace(dir: string, requiredBytes: number, message: string): Promise<void> {
  const stats = await statfs(dir)
  const freeBytes = Number(BigInt(stats.bavail) * BigInt(stats.bsize))
  if (freeBytes < requiredBytes) {
    const freeMb = Math.floor(freeBytes / 1024 / 1024)
    const requiredMb = Math.ceil(requiredBytes / 1024 / 1024)
    throw new Error(tr('{0}. Required: {1} MB; available: {2} MB', [message, requiredMb, freeMb]))
  }
}

async function launchNativeMacOSUpdate(
  channel: AppUpdateChannel,
  releasePage: string
): Promise<AppUpdateLaunchResult> {
  try {
    if (!showNativeMacOSUpdate(channel)) throw new Error('Native macOS updater did not start')
    return 'native'
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    await appendAppLog(`[Updater]: native macOS updater unavailable, ${detail}\n`).catch(() => {})
    // Recovery remains an explicit user action if the signed Sparkle bridge is unavailable.
    await shell.openExternal(releasePage)
    return 'external'
  }
}

export async function checkUpdate(): Promise<AppVersion | undefined> {
  if (process.platform === 'darwin') {
    const { updateChannel = 'stable' } = await getAppConfig()
    await launchNativeMacOSUpdate(
      updateChannel,
      updateChannel === 'rolling'
        ? 'https://github.com/amamiyakokoro/KokoroBox-Desktop/releases/tag/rolling'
        : 'https://github.com/amamiyakokoro/KokoroBox-Desktop/releases/latest'
    )
    return undefined
  }

  const { 'mixed-port': mixedPort = 7890 } = await getControledMihomoConfig()
  const { updateChannel = 'stable' } = await getAppConfig()
  const githubToken = await getGitHubToken()
  const url = UPDATE_MANIFEST_URLS[updateChannel]
  const res = await axios.get(url, {
    headers: {
      'Content-Type': 'application/octet-stream',
      ...getGitHubAuthHeaders(githubToken)
    },
    ...(mixedPort != 0 && {
      proxy: {
        protocol: 'http',
        host: '127.0.0.1',
        port: mixedPort
      }
    }),
    responseType: 'text'
  })
  const latest = parseYaml<AppVersion>(res.data)
  const currentVersion = app.getVersion()
  if (latest.version !== currentVersion) {
    return latest
  } else {
    return undefined
  }
}

async function stopServiceForPortableUpdate(): Promise<void> {
  const status = await serviceStatus().catch(async (error) => {
    await appendAppLog(`[Updater]: query service status failed before portable update, ${error}\n`)
    return 'unknown' as const
  })

  if (status === 'not-installed' || status === 'stopped') {
    return
  }

  await appendAppLog(`[Updater]: stop service before portable update, status: ${status}\n`)
  await stopService()
}

async function stagePortableUpdater(): Promise<{ path: string; argumentsPrefix: string[] }> {
  const updaterPath = path.join(dataDir(), 'kokorobox-portable-update.exe')
  const resolveNativeUpdater = (
    native as typeof native & { getPortableUpdaterPath?: () => string }
  ).getPortableUpdaterPath
  if (typeof resolveNativeUpdater === 'function') {
    try {
      await copyFile(resolveNativeUpdater(), updaterPath)
      return { path: updaterPath, argumentsPrefix: [] }
    } catch (error) {
      await appendAppLog(`[Updater]: native portable updater unavailable, ${error}\n`)
    }
  }

  // Older native packages have no updater sidecar. Keep their bundled Service
  // command until the new native package reaches all installed builds.
  await promisify(execFile)(servicePath(), ['portable-update', '--help'], { windowsHide: true })
  await copyFile(servicePath(), updaterPath)
  return { path: updaterPath, argumentsPrefix: ['portable-update'] }
}

async function ensureWindowsInstallerTempSpace(): Promise<void> {
  if (process.platform !== 'win32') {
    return
  }

  const tempDir = os.tmpdir()
  await ensureFreeSpace(
    tempDir,
    WINDOWS_INSTALLER_MIN_TEMP_SPACE_BYTES,
    tr('Not enough space in the temporary directory')
  )
}

export async function downloadAndInstallUpdate(
  version: string,
  tag?: string
): Promise<AppUpdateLaunchResult | void> {
  const releaseTag = resolveReleaseTag(version, tag)
  if (process.platform === 'darwin') {
    return launchNativeMacOSUpdate(
      releaseTag === 'rolling' ? 'rolling' : 'stable',
      `https://github.com/amamiyakokoro/KokoroBox-Desktop/releases/tag/${encodeURIComponent(releaseTag)}`
    )
  }

  let appUpdateInstalling = false
  let sysProxyPaused = false
  const pauseSysProxy = async (): Promise<void> => {
    sysProxyPaused = true
    await triggerSysProxy(false, false)
  }
  const resumeSysProxy = async (): Promise<void> => {
    if (!sysProxyPaused) return
    sysProxyPaused = false
    try {
      const { sysProxy, onlyActiveDevice = false } = await getAppConfig()
      if (sysProxy.enable) await triggerSysProxy(true, onlyActiveDevice)
    } catch (error) {
      await appendAppLog(`[Updater]: restore sysproxy failed, ${error}\n`).catch(() => {})
    }
  }
  const { 'mixed-port': mixedPort = 7890 } = await getControledMihomoConfig()
  const githubToken = await getGitHubToken()
  const baseUrl = `https://github.com/amamiyakokoro/KokoroBox-Desktop/releases/download/${releaseTag}/`
  const fileMap: Record<string, string> = {
    'win32-x64': `kokorobox-desktop-windows-${version}-x64-setup.exe`,
    'win32-arm64': `kokorobox-desktop-windows-${version}-arm64-setup.exe`
  }
  const file = fileMap[`${process.platform}-${process.arch}`]
  if (isPortable())
    throw new Error(tr('Automatic updates are not supported. Please download the update manually'))
  if (!file) {
    throw new Error(tr('Automatic updates are not supported. Please download the update manually'))
  }
  downloadCancelToken = axios.CancelToken.source()

  const apiUrl = `https://api.github.com/repos/amamiyakokoro/KokoroBox-Desktop/releases/tags/${releaseTag}`
  const apiRequestConfig: AxiosRequestConfig = {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      ...getGitHubAuthHeaders(githubToken)
    },
    ...(mixedPort != 0 && {
      proxy: {
        protocol: 'http',
        host: '127.0.0.1',
        port: mixedPort
      }
    }),
    cancelToken: downloadCancelToken.token
  }

  try {
    mainWindow?.webContents.send('update-status', {
      downloading: true,
      progress: 0
    })

    const releaseRes = await axios.get(apiUrl, apiRequestConfig)
    const assets: Array<{ name: string; digest?: string; size?: number }> =
      releaseRes.data.assets || []
    const matchedAsset = assets.find((a) => a.name === file)
    if (!matchedAsset || !matchedAsset.digest) {
      throw new Error(tr('No SHA-256 information found for "{0}" in the GitHub release', [file]))
    }
    const expectedHash = matchedAsset.digest.split(':')[1].toLowerCase()

    if (!existsSync(path.join(dataDir(), file))) {
      if (matchedAsset.size) {
        await ensureFreeSpace(
          dataDir(),
          matchedAsset.size,
          tr('Not enough space in the update download directory')
        )
      }
      const res = await axios.get(`${baseUrl}${file}`, {
        responseType: 'arraybuffer',
        ...(mixedPort != 0 && {
          proxy: {
            protocol: 'http',
            host: '127.0.0.1',
            port: mixedPort
          }
        }),
        headers: {
          'Content-Type': 'application/octet-stream',
          ...getGitHubAuthHeaders(githubToken)
        },
        cancelToken: downloadCancelToken.token,
        onDownloadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          )
          mainWindow?.webContents.send('update-status', {
            downloading: true,
            progress: percentCompleted
          })
        }
      })
      await writeFile(path.join(dataDir(), file), res.data)
    }

    const fileBuffer = await readFile(path.join(dataDir(), file))
    const hashSum = createHash('sha256')
    hashSum.update(fileBuffer)
    const localHash = hashSum.digest('hex').toLowerCase()
    if (localHash !== expectedHash) {
      await rm(path.join(dataDir(), file), { force: true })
      throw new Error(
        tr('SHA-256 verification failed: local hash {0} does not match expected hash {1}', [
          localHash,
          expectedHash
        ])
      )
    }

    mainWindow?.webContents.send('update-status', {
      downloading: false,
      progress: 100
    })

    if (file.endsWith('.exe')) {
      await ensureWindowsInstallerTempSpace()
      await pauseSysProxy()
      await pauseServiceFallbackForAppUpdate()
      spawn(path.join(dataDir(), file), ['/S', '--updated', '--force-run'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref()
      appUpdateInstalling = true
    }
    if (!systemCoreOnlyBuild && file.endsWith('.7z')) {
      const updater = await stagePortableUpdater()
      await copyFile(path.join(resourcesFilesDir(), '7za.exe'), path.join(dataDir(), '7za.exe'))
      await pauseSysProxy()
      await pauseServiceFallbackForAppUpdate()
      await stopServiceForPortableUpdate()
      const updaterProcess = spawn(
        updater.path,
        [
          ...updater.argumentsPrefix,
          '--parent-pid',
          String(process.pid),
          '--archive',
          path.join(dataDir(), file),
          '--extractor',
          path.join(dataDir(), '7za.exe'),
          '--application',
          exePath()
        ],
        { detached: true, stdio: 'ignore', windowsHide: true }
      )
      await new Promise<void>((resolve, reject) => {
        updaterProcess.once('spawn', resolve)
        updaterProcess.once('error', reject)
      })
      updaterProcess.unref()
      appUpdateInstalling = true
    }
    if (appUpdateInstalling) {
      // Installing an update is already an explicit user-approved restart.
      // Keep the normal cleanup lifecycle, but do not ask for a second quit confirmation.
      setNotQuitDialog()
      app.quit()
    }
  } catch (e) {
    if (!appUpdateInstalling) {
      await clearAppUpdateServiceFallbackPause()
      await resumeSysProxy()
    }
    await rm(path.join(dataDir(), file), { force: true })
    if (axios.isCancel(e)) {
      mainWindow?.webContents.send('update-status', {
        downloading: false,
        progress: 0,
        error: tr('Download cancelled')
      })
      return
    } else {
      mainWindow?.webContents.send('update-status', {
        downloading: false,
        progress: 0,
        error: e instanceof Error ? e.message : tr('Download failed')
      })
    }
    throw e
  } finally {
    downloadCancelToken = null
  }
}

export async function cancelUpdate(): Promise<void> {
  if (downloadCancelToken) {
    downloadCancelToken.cancel(tr('Download cancelled by user'))
    downloadCancelToken = null
  }
}
