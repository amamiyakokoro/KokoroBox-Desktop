import { tr } from '../../shared/i18n'
import { normalizeWindowsExecutablePath } from '../../shared/app-routing'
import { execFile, execFileSync, spawn } from 'child_process'
import { app, dialog, nativeImage, nativeTheme, shell } from 'electron'
import { mkdir, readFile, realpath, stat, writeFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { promisify } from 'util'
import { runElevated, setupFirewallRules } from '@uruhalushia/sparkle-native'
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
  const selected = dialog.showOpenDialogSync({
    title: tr('选择应用程序'),
    filters: [{ name: tr('Windows 应用程序'), extensions: ['exe'] }],
    properties: ['openFile', 'multiSelections']
  })
  if (!selected) return undefined

  await mkdir(appRoutingIconDir(), { recursive: true })
  const applications: AppRoutingApplicationSelection[] = []
  for (const selectedPath of selected) {
    const executablePath = normalizeWindowsExecutablePath(await realpath(selectedPath))
    if (
      path.extname(executablePath).toLowerCase() !== '.exe' ||
      !(await stat(executablePath)).isFile()
    ) {
      throw new Error('Application routing requires an existing .exe file')
    }
    const executableName = path.win32.basename(executablePath)
    const iconCacheKey = crypto
      .createHash('sha256')
      .update(executablePath.toLowerCase(), 'utf8')
      .digest('hex')
    const icon = await app.getFileIcon(executablePath, { size: 'normal' })
    const iconDataUrl = icon.isEmpty() ? undefined : icon.toDataURL()
    if (!icon.isEmpty()) {
      await writeFile(path.join(appRoutingIconDir(), `${iconCacheKey}.png`), icon.toPNG())
    }
    applications.push({
      executablePath,
      executableName,
      iconDataUrl
    })
  }
  return applications
}

export async function getAppRoutingIcon(executablePath: string): Promise<string | undefined> {
  if (!/^(?:[a-zA-Z]:\\|\\\\)[^\0]+\.exe$/i.test(executablePath)) {
    throw new Error('Invalid application executable path')
  }
  const iconCacheKey = crypto
    .createHash('sha256')
    .update(executablePath.toLowerCase(), 'utf8')
    .digest('hex')
  const iconPath = path.join(appRoutingIconDir(), `${iconCacheKey}.png`)
  if (!existsSync(iconPath)) return undefined
  const icon = nativeImage.createFromBuffer(await readFile(iconPath))
  return icon.isEmpty() ? undefined : icon.toDataURL()
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
