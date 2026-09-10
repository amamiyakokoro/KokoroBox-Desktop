import { tr } from '../../shared/i18n'
import {
  isProtectedAppRoutingProcess,
  normalizeWindowsExecutablePath,
  protectedAppRoutingProcessNames
} from '../../shared/app-routing'
import { execFile, spawn } from 'child_process'
import { app, dialog, nativeImage, nativeTheme, shell } from 'electron'
import { mkdir, readFile, realpath, writeFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { promisify } from 'util'
import {
  fileToDataUrl,
  inspectApplication,
  isRunningAsAdmin,
  launchElevated,
  launchUnelevated,
  scanWindowsApplications,
  setupFirewallRules
} from 'kokorobox-native'
import {
  dataDir,
  exePath,
  mihomoCorePath,
  overridePath,
  profilePath,
  resourcesDir,
  taskDir,
  appRoutingIconDir
} from '../utils/dirs'
import { rmSync } from 'fs'
import { execWithElevation } from '../utils/elevation'

export function getFilePath(
  ext: string[],
  title = tr('选择订阅文件'),
  filterName = `${ext} file`
): string[] | undefined {
  return dialog.showOpenDialogSync({
    title,
    filters: [{ name: filterName, extensions: ext }],
    properties: ['openFile']
  })
}

export async function getApplicationPaths(): Promise<AppRoutingApplicationSelection[] | undefined> {
  if (!['win32', 'darwin', 'linux'].includes(process.platform)) return undefined
  const isMac = process.platform === 'darwin'
  const isLinux = process.platform === 'linux'
  const selected = dialog.showOpenDialogSync({
    title: tr('选择应用程序'),
    filters:
      isMac || isLinux
        ? []
        : [
            {
              name: isMac ? tr('macOS 应用程序') : tr('Windows 应用程序'),
              extensions: [isMac ? 'app' : 'exe']
            }
          ],
    properties: ['openFile', 'multiSelections']
  })
  if (!selected) return undefined

  await mkdir(appRoutingIconDir(), { recursive: true })
  const applications: AppRoutingApplicationSelection[] = []
  for (const selectedPath of selected) {
    const application = await inspectApplication(selectedPath)
    const { executablePath, executableName, identifier, identifierKind } = application
    const iconDataUrl = await loadApplicationIcon(executablePath, application.iconDataUrl)
    applications.push({
      executablePath,
      executableName,
      identifier,
      identifierKind,
      iconDataUrl
    })
  }
  return applications
}

export async function scanAppRoutingDirectory(
  requestedDirectory?: string
): Promise<AppRoutingDirectorySelection | undefined> {
  if (process.platform !== 'win32') return undefined
  const selectedDirectory =
    requestedDirectory ??
    dialog.showOpenDialogSync({
      title: tr('扫描应用程序文件夹'),
      properties: ['openDirectory']
    })?.[0]
  if (!selectedDirectory) return undefined

  const {
    applications: scannedApplications,
    truncated,
    unreadableDirectoryCount
  } = await scanWindowsApplications(selectedDirectory, 512, protectedAppRoutingProcessNames())
  // Keep the dynamic installer-name guard in Desktop as well. The native
  // scanner receives the static list above, while this protects new installer
  // version names without lowering its bounded scan limit.
  const applications = scannedApplications.filter(
    (application) => !isProtectedAppRoutingProcess(path.win32.basename(application.executablePath))
  )
  const directoryPath = normalizeWindowsExecutablePath(await realpath(selectedDirectory))
  return {
    directoryPath,
    name: path.win32.basename(directoryPath) || directoryPath,
    applications,
    truncated,
    unreadableDirectoryCount
  }
}

export async function getAppRoutingIcon(executablePath: string): Promise<string | undefined> {
  const validWindowsPath = /^(?:[a-zA-Z]:\\|\\\\)[^\0]+\.exe$/i.test(executablePath)
  const validMacPath = /^\/[^\0]+\.app$/i.test(executablePath)
  const validLinuxPath = process.platform === 'linux' && /^\/[^\0\r\n]+$/.test(executablePath)
  if (!validWindowsPath && !validMacPath && !validLinuxPath) {
    throw new Error('Invalid application path')
  }
  return loadApplicationIcon(executablePath)
}

async function loadApplicationIcon(
  executablePath: string,
  nativeIconDataUrl?: string
): Promise<string | undefined> {
  const iconCacheKey = crypto
    .createHash('sha256')
    .update(`native-v2:${executablePath}`, 'utf8')
    .digest('hex')
  const iconPath = path.join(appRoutingIconDir(), `${iconCacheKey}.png`)
  try {
    let icon: Electron.NativeImage
    try {
      icon = nativeIconDataUrl
        ? nativeImage.createFromDataURL(nativeIconDataUrl)
        : nativeImage.createFromDataURL(fileToDataUrl(executablePath))
    } catch {
      icon = nativeImage.createEmpty()
    }
    if (icon.isEmpty()) icon = await app.getFileIcon(executablePath, { size: 'large' })
    if (!icon.isEmpty()) {
      await mkdir(appRoutingIconDir(), { recursive: true })
      await writeFile(iconPath, icon.toPNG()).catch(() => {})
      return icon.toDataURL()
    }
  } catch {
    // An unavailable application must not prevent editing its routing rule.
  }
  try {
    const cached = nativeImage.createFromBuffer(await readFile(iconPath))
    return cached.isEmpty() ? undefined : cached.toDataURL()
  } catch {
    return undefined
  }
}

export async function readTextFile(filePath: string): Promise<string> {
  return await readFile(filePath, 'utf8')
}

export async function readImageFileDataURL(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.ico' || ext === '.icns') {
    const image = nativeImage.createFromPath(filePath)
    if (image.isEmpty()) throw new Error('Failed to load image')
    return image.toDataURL()
  }
  const mimeType =
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
  const data = await readFile(filePath)

  return `data:${mimeType};base64,${data.toString('base64')}`
}

export function openFile(type: 'profile' | 'override', id: string, ext?: 'yaml' | 'js'): void {
  if (type === 'profile') {
    shell.openPath(profilePath(id))
  }
  if (type === 'override') {
    shell.openPath(overridePath(id, ext || 'js'))
  }
}

export async function openUWPTool(): Promise<void> {
  const execFilePromise = promisify(execFile)
  const uwpToolPath = path.join(resourcesDir(), 'files', 'enableLoopback.exe')
  await execFilePromise(uwpToolPath)
}

export async function setupFirewall(): Promise<void> {
  if (process.platform === 'win32') {
    setupFirewallRules([
      { name: 'mihomo', applicationPath: mihomoCorePath('mihomo') },
      { name: 'mihomo-alpha', applicationPath: mihomoCorePath('mihomo-alpha') },
      { name: 'KokoroBox', applicationPath: exePath() }
    ])
  }
}

export function setNativeTheme(theme: 'system' | 'light' | 'dark'): void {
  nativeTheme.themeSource = theme
}

export const WINDOWS_ELEVATE_TASK_NAME = 'KokoroBox Elevated'
export const LEGACY_WINDOWS_ELEVATE_TASK_NAME = 'sparkle-run'

function taskReceiptPath(): string {
  return path.join(taskDir(), 'kokorobox-elevated-task.json')
}

export async function deleteElevateTask(): Promise<void> {
  for (const name of [WINDOWS_ELEVATE_TASK_NAME, LEGACY_WINDOWS_ELEVATE_TASK_NAME]) {
    try {
      await execWithElevation('schtasks.exe', ['/delete', '/tn', name, '/f'])
    } catch {
      // Ignore tasks that do not exist.
    }
  }
  rmSync(taskReceiptPath(), { force: true })
}

export async function checkElevateTask(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  try {
    return isRunningAsAdmin()
  } catch {
    return false
  }
}

function relaunchWindowsWithPrivilege(elevated: boolean): void {
  if (process.platform !== 'win32') {
    throw new Error(tr('此功能仅支持 Windows'))
  }

  const currentlyElevated = isRunningAsAdmin()
  if (currentlyElevated === elevated) return

  // Release the lock before creating the replacement process. If UAC is
  // cancelled or creation fails, reacquire it so the current process remains
  // a correctly managed single instance.
  app.releaseSingleInstanceLock()
  try {
    if (elevated) launchElevated(exePath())
    else launchUnelevated(exePath())
  } catch (error) {
    app.requestSingleInstanceLock()
    throw error
  }

  app.quit()
}

export function relaunchWindowsElevated(): void {
  relaunchWindowsWithPrivilege(true)
}

export function relaunchWindowsUnelevated(): void {
  relaunchWindowsWithPrivilege(false)
}

export function resetAppConfig(): void {
  if (process.platform === 'win32') {
    spawn(
      'cmd',
      [
        '/C',
        `"timeout /t 2 /nobreak >nul && rmdir /s /q "${dataDir()}" && start "" "${exePath()}""`
      ],
      {
        shell: true,
        detached: true
      }
    ).unref()
  } else {
    const script = `while kill -0 ${process.pid} 2>/dev/null; do
  sleep 0.1
done
  rm -rf '${dataDir()}'
  ${process.argv.join(' ')} & disown
exit
`
    spawn('sh', ['-c', `"${script}"`], {
      shell: true,
      detached: true,
      stdio: 'ignore'
    })
  }
  app.quit()
}
