import { ChildProcess, spawn } from 'child_process'
import { getAppConfig } from '../config'
import { dataDir, mihomoIpcPath, resourcesFilesDir } from '../utils/dirs'
import path from 'path'
import { existsSync } from 'fs'
import { cp, mkdir, readFile, rm, writeFile } from 'fs/promises'

let child: ChildProcess | undefined

const TRAFFIC_MONITOR_INITIAL_CONFIG =
  '\uFEFF' +
  [
    '[general]',
    'check_update_when_start=false',
    '',
    '[config]',
    'show_task_bar_wnd=true',
    'hide_main_window=true',
    'show_notify_icon=false',
    '',
    '[task_bar]',
    'tbar_display_item=0',
    'plugin_display_item=KokoroBoxUploadSpeed,KokoroBoxDownloadSpeed',
    ''
  ].join('\r\n')

async function prepareMonitorRuntime(): Promise<string> {
  const packagedDir = path.join(resourcesFilesDir(), 'TrafficMonitor')
  const runtimeDir = path.join(dataDir(), 'traffic-monitor')
  await mkdir(runtimeDir, { recursive: true })
  await cp(packagedDir, runtimeDir, { recursive: true, force: true })

  // Never carry the old binary-only plugin into the isolated KokoroBox runtime.
  await rm(path.join(runtimeDir, 'plugins', 'Sparkle.dll'), { force: true })
  if (!existsSync(path.join(runtimeDir, 'plugins', 'KokoroBoxTrafficPlugin.dll'))) {
    throw new Error('KokoroBox TrafficMonitor plugin is missing from the application bundle')
  }

  const configPath = path.join(runtimeDir, 'config.ini')
  if (!existsSync(configPath)) {
    await writeFile(configPath, TRAFFIC_MONITOR_INITIAL_CONFIG, 'utf8')
  }
  return runtimeDir
}

export async function startMonitor(detached = false): Promise<void> {
  if (process.platform !== 'win32') return
  if (existsSync(path.join(dataDir(), 'monitor.pid'))) {
    const pid = parseInt(await readFile(path.join(dataDir(), 'monitor.pid'), 'utf-8'))
    try {
      process.kill(pid, 'SIGINT')
    } catch {
      // ignore
    } finally {
      await rm(path.join(dataDir(), 'monitor.pid'))
    }
  }
  await stopMonitor()
  const { showTraffic = false } = await getAppConfig()
  if (!showTraffic) return
  const runtimeDir = await prepareMonitorRuntime()
  child = spawn(path.join(runtimeDir, 'TrafficMonitor.exe'), [], {
    cwd: runtimeDir,
    detached: detached,
    stdio: detached ? 'ignore' : undefined,
    windowsHide: true,
    env: {
      ...process.env,
      KOKOROBOX_MIHOMO_PIPE: mihomoIpcPath()
    }
  })
  if (detached) {
    if (child && child.pid) {
      await writeFile(path.join(dataDir(), 'monitor.pid'), child.pid.toString())
    }
    child.unref()
  }
}

async function stopMonitor(): Promise<void> {
  if (child) {
    try {
      child.kill('SIGINT')
    } finally {
      child = undefined
    }
  }
}
