import { tr } from '../../shared/i18n'
import { normalizeWindowsExecutablePath } from '../../shared/app-routing'
import { execFile, execFileSync, spawn } from 'child_process'
import { app, dialog, nativeImage, nativeTheme, shell } from 'electron'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import crypto from 'crypto'
import { promisify } from 'util'
import { fileToDataUrl, runElevated, setupFirewallRules } from '@uruhalushia/sparkle-native'
import {
  dataDir,
  exePath,
  mihomoCorePath,
  overridePath,
  profilePath,
  resourcesDir,
  resourcesFilesDir,
  taskDir,
  appRoutingIconDir
} from '../utils/dirs'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
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
  if (process.platform !== 'win32' && process.platform !== 'darwin') return undefined
  const isMac = process.platform === 'darwin'
  const selected = dialog.showOpenDialogSync({
    title: tr('选择应用程序'),
    filters: isMac
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
    const canonicalPath = await realpath(selectedPath)
    const executablePath = isMac ? canonicalPath : normalizeWindowsExecutablePath(canonicalPath)
    const fileStat = await stat(executablePath)
    const isMacBundle =
      fileStat.isDirectory() && path.extname(executablePath).toLowerCase() === '.app'
    const isMacExecutable = fileStat.isFile() && (fileStat.mode & 0o111) !== 0
    if (
      isMac
        ? !isMacBundle && !isMacExecutable
        : path.extname(executablePath).toLowerCase() !== '.exe' || !fileStat.isFile()
    ) {
      throw new Error(
        isMac
          ? 'Select a signed macOS application or executable'
          : 'Application routing requires an existing .exe file'
      )
    }
    const executableName = isMac
      ? path.basename(executablePath, path.extname(executablePath))
      : path.win32.basename(executablePath)
    let identifier = executableName
    let identifierKind: AppRoutingIdentifierKind = 'windows-executable'
    if (isMac) {
      const execFilePromise = promisify(execFile)
      const { stderr } = await execFilePromise(
        '/usr/bin/codesign',
        ['--display', '--verbose=2', executablePath],
        { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024 }
      )
      const match = stderr.match(/^Identifier=(.+)$/m)
      if (!match?.[1] || /[\r\n]/.test(match[1])) {
        throw new Error('The selected macOS application has no usable signing identifier')
      }
      identifier = match[1]
      identifierKind = 'macos-signing-identifier'
    }
    const iconDataUrl = await loadApplicationIcon(executablePath)
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

export async function getAppRoutingIcon(executablePath: string): Promise<string | undefined> {
  const validWindowsPath = /^(?:[a-zA-Z]:\\|\\\\)[^\0]+\.exe$/i.test(executablePath)
  const validMacPath = /^\/[^\0]+\.app$/i.test(executablePath)
  if (!validWindowsPath && !validMacPath) {
    throw new Error('Invalid application path')
  }
  return loadApplicationIcon(executablePath)
}

async function loadApplicationIcon(executablePath: string): Promise<string | undefined> {
  const iconCacheKey = crypto
    .createHash('sha256')
    .update(`native-v2:${executablePath}`, 'utf8')
    .digest('hex')
  const iconPath = path.join(appRoutingIconDir(), `${iconCacheKey}.png`)
  try {
    let icon: Electron.NativeImage
    try {
      icon =
        process.platform === 'darwin' && executablePath.endsWith('.app')
          ? await loadMacBundleIcon(executablePath)
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

async function loadMacBundleIcon(bundlePath: string): Promise<Electron.NativeImage> {
  const run = promisify(execFile)
  const { stdout } = await run(
    '/usr/bin/plutil',
    [
      '-extract',
      'CFBundleIconFile',
      'raw',
      '-o',
      '-',
      path.join(bundlePath, 'Contents', 'Info.plist')
    ],
    { timeout: 5000, maxBuffer: 64 * 1024 }
  )
  const name = stdout.trim()
  if (!name || path.basename(name) !== name || name === '.' || name === '..') {
    return nativeImage.createEmpty()
  }
  const resource = path.join(
    bundlePath,
    'Contents',
    'Resources',
    path.extname(name) ? name : `${name}.icns`
  )
  const temporary = await mkdtemp(path.join(tmpdir(), 'kokorobox-app-icon-'))
  try {
    const png = path.join(temporary, 'icon.png')
    await run('/usr/bin/sips', ['-s', 'format', 'png', resource, '--out', png], {
      timeout: 5000,
      maxBuffer: 64 * 1024
    })
    return nativeImage.createFromBuffer(await readFile(png)).resize({ width: 128, height: 128 })
  } finally {
    await rm(temporary, { recursive: true, force: true })
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
export const WINDOWS_RUNNER_FILENAME = 'kokorobox-run.exe'
export const WINDOWS_RUNNER_PARAMS_FILENAME = 'kokorobox-runner-params.json'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function runnerPath(): string {
  return path.join(resourcesFilesDir(), WINDOWS_RUNNER_FILENAME)
}

function runnerParamsPath(): string {
  return path.join(taskDir(), WINDOWS_RUNNER_PARAMS_FILENAME)
}

function elevateTaskXml(): string {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers />
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>false</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>3</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>"${escapeXml(runnerPath())}"</Command>
      <Arguments>"${escapeXml(exePath())}" "${escapeXml(runnerParamsPath())}"</Arguments>
    </Exec>
  </Actions>
</Task>
`
}

function taskReceiptPath(): string {
  return path.join(taskDir(), 'kokorobox-elevated-task.json')
}

function writeTaskReceipt(): void {
  writeFileSync(
    taskReceiptPath(),
    JSON.stringify({
      taskName: WINDOWS_ELEVATE_TASK_NAME,
      executable: exePath(),
      runner: runnerPath()
    })
  )
}

function createTaskArgs(taskFilePath: string): string[] {
  return ['/create', '/tn', WINDOWS_ELEVATE_TASK_NAME, '/xml', taskFilePath, '/f']
}

function prepareElevateTaskFile(): string {
  if (!existsSync(runnerPath())) throw new Error(`${WINDOWS_RUNNER_FILENAME} not found`)
  const taskFilePath = path.join(taskDir(), 'kokorobox-elevated.xml')
  writeFileSync(taskFilePath, Buffer.from(`\ufeff${elevateTaskXml()}`, 'utf-16le'))
  return taskFilePath
}

export function createElevateTaskSync(): void {
  const taskFilePath = prepareElevateTaskFile()
  execFileSync('schtasks.exe', createTaskArgs(taskFilePath))
  writeTaskReceipt()
}

export function createElevateTaskWithPromptSync(): void {
  const taskFilePath = prepareElevateTaskFile()
  const exitCode = runElevated('schtasks.exe', createTaskArgs(taskFilePath))
  if (exitCode !== 0) throw new Error(`Failed to create elevated task: exit code ${exitCode}`)
  writeTaskReceipt()
}

export async function createElevateTask(): Promise<void> {
  const taskFilePath = prepareElevateTaskFile()
  await execWithElevation('schtasks.exe', createTaskArgs(taskFilePath))
  writeTaskReceipt()
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
  return checkElevateTaskSync()
}

export function checkElevateTaskSync(): boolean {
  try {
    execFileSync('schtasks.exe', ['/query', '/tn', WINDOWS_ELEVATE_TASK_NAME], { stdio: 'pipe' })
    if (!existsSync(taskReceiptPath())) return false
    const receipt = JSON.parse(readFileSync(taskReceiptPath(), 'utf8')) as Record<string, unknown>
    return (
      receipt.taskName === WINDOWS_ELEVATE_TASK_NAME &&
      receipt.executable === exePath() &&
      receipt.runner === runnerPath()
    )
  } catch {
    return false
  }
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
