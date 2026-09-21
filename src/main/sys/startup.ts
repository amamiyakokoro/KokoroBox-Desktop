import { app } from 'electron'
import { spawn } from 'child_process'

export function useLinuxCustomRelaunch(): void {
  if (process.platform !== 'linux') return

  // Electron can still fail to relaunch Linux apps started from a desktop file or
  // terminal. Keep this fallback until https://github.com/electron/electron/issues/48280
  // has a released fix that works for packaged applications.
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
