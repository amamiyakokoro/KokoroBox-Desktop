import { exePath, homeDir, taskDir } from '../utils/dirs'
import { execWithElevation } from '../utils/elevation'
import { rm } from 'fs/promises'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { promisify } from 'util'
import path from 'path'
import { LEGACY_WINDOWS_ELEVATE_TASK_NAME } from './misc'
import {
  getLaunchAtLogin,
  openMacosLoginItemsSettings,
  setLaunchAtLogin
} from 'kokorobox-native'

export const WINDOWS_AUTO_RUN_TASK_NAME = 'KokoroBox'
export const LEGACY_WINDOWS_AUTO_RUN_TASK_NAME = 'sparkle'
const linuxAppName = 'kokorobox'
const legacyLinuxAppName = 'sparkle'

function linuxAutoRunPath(appName: string): string {
  return path.join(homeDir, '.config', 'autostart', `${appName}.desktop`)
}

function launchAtLoginOptions() {
  return {
    identifier:
      process.platform === 'win32'
        ? WINDOWS_AUTO_RUN_TASK_NAME
        : process.platform === 'linux'
          ? linuxAppName
          : 'com.amamiyakokoro.kokorobox',
    displayName: 'KokoroBox',
    executablePath: exePath()
  }
}

async function windowsTaskExists(name: string): Promise<boolean> {
  const execFilePromise = promisify(execFile)
  try {
    await execFilePromise('schtasks.exe', ['/query', '/tn', name], { windowsHide: true })
    return true
  } catch {
    return false
  }
}

export async function checkAutoRun(): Promise<AutoRunStatus> {
  const current = await getLaunchAtLogin(launchAtLoginOptions())
  if (process.platform === 'win32') {
    return {
      enabled: current.enabled || (await windowsTaskExists(LEGACY_WINDOWS_AUTO_RUN_TASK_NAME)),
      requiresApproval: false,
      backend: current.backend
    }
  }

  if (process.platform === 'darwin') {
    return {
      enabled: current.enabled,
      requiresApproval: current.requiresApproval,
      backend: current.backend
    }
  }

  if (process.platform === 'linux') {
    return {
      enabled: current.enabled || existsSync(linuxAutoRunPath(legacyLinuxAppName)),
      requiresApproval: false,
      backend: current.backend
    }
  }
  return { enabled: false, requiresApproval: false, backend: current.backend }
}

export async function enableAutoRun(): Promise<AutoRunStatus> {
  await setLaunchAtLogin(launchAtLoginOptions(), true)
  if (process.platform === 'linux') {
    await rm(linuxAutoRunPath(legacyLinuxAppName), { force: true })
  }
  return checkAutoRun()
}

export async function disableAutoRun(): Promise<AutoRunStatus> {
  await setLaunchAtLogin(launchAtLoginOptions(), false)
  if (process.platform === 'win32') {
    for (const name of [LEGACY_WINDOWS_AUTO_RUN_TASK_NAME]) {
      if (await windowsTaskExists(name))
        await execWithElevation('schtasks.exe', ['/delete', '/tn', name, '/f'])
    }
  }
  if (process.platform === 'linux') {
    await rm(linuxAutoRunPath(legacyLinuxAppName), { force: true })
  }
  return checkAutoRun()
}

export function openAutoRunSystemSettings(): void {
  if (process.platform !== 'darwin') {
    throw new Error('Launch-at-login system settings are available only on macOS')
  }
  openMacosLoginItemsSettings()
}

export async function migrateLegacyWindowsTasks(): Promise<void> {
  if (process.platform !== 'win32') return

  const legacyAutoRun = await windowsTaskExists(LEGACY_WINDOWS_AUTO_RUN_TASK_NAME)
  const currentAutoRun = await getLaunchAtLogin(launchAtLoginOptions())
  if (legacyAutoRun && !currentAutoRun.enabled) {
    await enableAutoRun()
  }

  for (const name of [LEGACY_WINDOWS_AUTO_RUN_TASK_NAME, LEGACY_WINDOWS_ELEVATE_TASK_NAME]) {
    if (await windowsTaskExists(name))
      await execWithElevation('schtasks.exe', ['/delete', '/tn', name, '/f'])
  }

  await Promise.all(
    ['sparkle.xml', 'sparkle-run.xml', 'sparkle-run.exe', 'param.txt'].map((file) =>
      rm(path.join(taskDir(), file), { force: true })
    )
  )
}
