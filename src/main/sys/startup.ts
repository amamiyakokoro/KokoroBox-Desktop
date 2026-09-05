import { tr } from '../../shared/i18n'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import { execSync, spawn } from 'child_process'
import { existsSync, writeFileSync } from 'fs'
import iconv from 'iconv-lite'
import path from 'path'
import { exePath, taskDir } from '../utils/dirs'
import { createElevateTaskSync } from './misc'
import { showNotification } from '../utils/notification'

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

  try {
    createElevateTaskSync()
  } catch (createError) {
    try {
      writeFileSync(
        path.join(taskDir(), 'param.txt'),
        process.argv.slice(1).length > 0 ? process.argv.slice(1).join(' ') : 'empty'
      )
      if (!existsSync(path.join(taskDir(), 'sparkle-run.exe'))) {
        throw new Error('sparkle-run.exe not found')
      }
      execSync('%SystemRoot%\\System32\\schtasks.exe /run /tn sparkle-run')
    } catch (error) {
      let createErrorStr = `${createError}`
      let errorStr = `${error}`
      try {
        createErrorStr = iconv.decode((createError as { stderr: Buffer }).stderr, 'gbk')
        errorStr = iconv.decode((error as { stderr: Buffer }).stderr, 'gbk')
      } catch {
        // ignore
      }
      void showNotification({
        title: tr('首次启动请以管理员权限运行'),
        body: tr('首次启动请以管理员权限运行\n{0}\n{1}', [createErrorStr, errorStr]),
        variant: 'danger'
      })
    } finally {
      exitApp()
    }
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
