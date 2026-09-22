import { app } from 'electron'
import { spawn } from 'child_process'
import {
  windowsRelaunchWaitArgument,
  windowsRelaunchWaitArgumentPrefix
} from '../../shared/windows-relaunch'

export function useLinuxCustomRelaunch(): void {
  if (process.platform !== 'linux') return

  // Wait until the old process has released its single-instance lock before
  // starting the replacement. Pass arguments as an array, without a shell.
  app.relaunch = (options): void => {
    const args = (options?.args ?? process.argv.slice(1)).filter(
      (argument) => !argument.startsWith(windowsRelaunchWaitArgumentPrefix)
    )
    spawn(process.execPath, [...args, windowsRelaunchWaitArgument(process.pid)], {
      detached: true,
      stdio: 'ignore'
    }).unref()
  }
}
