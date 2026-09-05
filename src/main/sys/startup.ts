import { tr } from '../../shared/i18n'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import { execFileSync, spawn } from 'child_process'
import { writeFileSync } from 'fs'
import iconv from 'iconv-lite'
import path from 'path'
import { exePath, taskDir } from '../utils/dirs'
import {
  checkElevateTaskSync,
  createElevateTaskSync,
  createElevateTaskWithPromptSync,
  WINDOWS_ELEVATE_TASK_NAME,
  WINDOWS_RUNNER_PARAMS_FILENAME
} from './misc'
import { showNotification } from '../utils/notification'
import { isRunningAsAdmin } from '@uruhalushia/sparkle-native'

function safeRunnerArguments(argv: string[]): string[] {
  return argv.filter((value) => value.length <= 8192 && /^(clash|mihomo|sparkle):\/\//i.test(value))
}

export function ensureWindowsElevatedStartup(
  corePermissionMode: string | undefined,
  exitApp: () => void
): void {
  if (
    process.platform !== 'win32' ||
    is.dev ||
    process.argv.includes('noadmin') ||
    corePermissionMode === 'service'
  ) {
    return
  }

  let runningAsAdmin = false
  try {
    runningAsAdmin = isRunningAsAdmin()
  } catch {
    // Treat an unavailable native check as a normal unelevated launch.
  }

  if (runningAsAdmin) {
    try {
      createElevateTaskSync()
    } catch (error) {
      let errorStr = `${error}`
      try {
        errorStr = iconv.decode((error as { stderr: Buffer }).stderr, 'gbk')
      } catch {
        // ignore
      }
      void showNotification({
        title: tr('首次启动请以管理员权限运行'),
        body: errorStr,
        variant: 'danger'
      })
      exitApp()
    }
    return
  }

  try {
    writeFileSync(
      path.join(taskDir(), WINDOWS_RUNNER_PARAMS_FILENAME),
      JSON.stringify(safeRunnerArguments(process.argv.slice(1)))
    )
    if (!checkElevateTaskSync()) createElevateTaskWithPromptSync()
    execFileSync('schtasks.exe', ['/run', '/tn', WINDOWS_ELEVATE_TASK_NAME])
  } catch (error) {
    let errorStr = `${error}`
    try {
      errorStr = iconv.decode((error as { stderr: Buffer }).stderr, 'gbk')
    } catch {
      // ignore
    }
    void showNotification({
      title: tr('首次启动请以管理员权限运行'),
      body: errorStr,
      variant: 'danger'
    })
  } finally {
    exitApp()
  }
}

export function useLinuxCustomRelaunch(): void {
  if (process.platform !== 'linux') return

  app.relaunch = (): void => {
    const script = `while kill -0 ${process.pid} 2>/dev/null; do
  sleep 0.1
done
${process.argv.join(' ')} & disown
exit
`
    spawn('sh', ['-c', `"${script}"`], {
      shell: true,
      detached: true,
      stdio: 'ignore'
    })
  }
}

export function applyWindowsGpuWorkaround(): void {
  const electronMajor = parseInt(process.versions.electron.split('.')[0], 10) || 0
  if (process.platform === 'win32' && !exePath().startsWith('C') && electronMajor < 38) {
    // https://github.com/electron/electron/issues/43278
    // https://github.com/electron/electron/issues/36698
    app.commandLine.appendSwitch('in-process-gpu')
  }
}
