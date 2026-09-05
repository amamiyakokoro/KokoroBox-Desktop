import { exePath, homeDir, taskDir } from '../utils/dirs'
import { execWithElevation } from '../utils/elevation'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { promisify } from 'util'
import path from 'path'
import { LEGACY_WINDOWS_ELEVATE_TASK_NAME } from './misc'

export const WINDOWS_AUTO_RUN_TASK_NAME = 'KokoroBox'
export const LEGACY_WINDOWS_AUTO_RUN_TASK_NAME = 'sparkle'
const linuxAppName = 'sparkle'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function taskXml(): string {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <Delay>PT3S</Delay>
    </LogonTrigger>
  </Triggers>
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
      <Command>"${escapeXml(exePath())}"</Command>
    </Exec>
  </Actions>
</Task>
`
}

async function windowsTaskExists(name: string): Promise<boolean> {
  const execFilePromise = promisify(execFile)
  try {
    await execFilePromise('schtasks.exe', ['/query', '/tn', name])
    return true
  } catch {
    return false
  }
}

export async function checkAutoRun(): Promise<boolean> {
  if (process.platform === 'win32') {
    return (
      (await windowsTaskExists(WINDOWS_AUTO_RUN_TASK_NAME)) ||
      (await windowsTaskExists(LEGACY_WINDOWS_AUTO_RUN_TASK_NAME))
    )
  }

  if (process.platform === 'darwin') {
    const execFilePromise = promisify(execFile)
    const { stdout } = await execFilePromise('osascript', [
      '-e',
      `tell application "System Events" to get the name of every login item`
    ])
    return stdout.includes(exePath().split('.app')[0].replace('/Applications/', ''))
  }

  if (process.platform === 'linux') {
    return existsSync(path.join(homeDir, '.config', 'autostart', `${linuxAppName}.desktop`))
  }
  return false
}

export async function enableAutoRun(): Promise<void> {
  if (process.platform === 'win32') {
    const taskFilePath = path.join(taskDir(), 'kokorobox-autorun.xml')
    await writeFile(taskFilePath, Buffer.from(`\ufeff${taskXml()}`, 'utf-16le'))
    await execWithElevation('schtasks.exe', [
      '/create',
      '/tn',
      WINDOWS_AUTO_RUN_TASK_NAME,
      '/xml',
      `${taskFilePath}`,
      '/f'
    ])
  }
  if (process.platform === 'darwin') {
    const execFilePromise = promisify(execFile)
    await execFilePromise('osascript', [
      '-e',
      `tell application "System Events" to make login item at end with properties {path:"${exePath().split('.app')[0]}.app", hidden:false}`
    ])
  }
  if (process.platform === 'linux') {
    let desktop = `
[Desktop Entry]
Name=KokoroBox
Exec=${exePath()} %U
Terminal=false
Type=Application
Icon=sparkle
StartupWMClass=sparkle
Comment=KokoroBox
Categories=Utility;
`

    if (existsSync(`/usr/share/applications/${linuxAppName}.desktop`)) {
      desktop = await readFile(`/usr/share/applications/${linuxAppName}.desktop`, 'utf8')
    }
    const autostartDir = path.join(homeDir, '.config', 'autostart')
    if (!existsSync(autostartDir)) {
      await mkdir(autostartDir, { recursive: true })
    }
    const desktopFilePath = path.join(autostartDir, `${linuxAppName}.desktop`)
    await writeFile(desktopFilePath, desktop)
  }
}

export async function disableAutoRun(): Promise<void> {
  if (process.platform === 'win32') {
    for (const name of [WINDOWS_AUTO_RUN_TASK_NAME, LEGACY_WINDOWS_AUTO_RUN_TASK_NAME]) {
      if (await windowsTaskExists(name))
        await execWithElevation('schtasks.exe', ['/delete', '/tn', name, '/f'])
    }
  }
  if (process.platform === 'darwin') {
    const execFilePromise = promisify(execFile)
    await execFilePromise('osascript', [
      '-e',
      `tell application "System Events" to delete login item "${exePath().split('.app')[0].replace('/Applications/', '')}"`
    ])
  }
  if (process.platform === 'linux') {
    const desktopFilePath = path.join(homeDir, '.config', 'autostart', `${linuxAppName}.desktop`)
    await rm(desktopFilePath)
  }
}

export async function migrateLegacyWindowsTasks(): Promise<void> {
  if (process.platform !== 'win32') return

  const legacyAutoRun = await windowsTaskExists(LEGACY_WINDOWS_AUTO_RUN_TASK_NAME)
  if (legacyAutoRun && !(await windowsTaskExists(WINDOWS_AUTO_RUN_TASK_NAME))) {
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
