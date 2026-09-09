import { app } from 'electron'
import { spawn } from 'child_process'
import { exePath } from '../utils/dirs'

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
