import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { readFile, rm } from 'fs/promises'
import { join, sep } from 'path'
import * as native from 'kokorobox-native'
import { getAppConfig } from '../config'
import { dataDir } from '../utils/dirs'
import { appendAppLog } from '../utils/log'
import {
  encodeTrafficPresenterCommand,
  trafficPresenterLayout,
  trafficPresenterProtocolVersion,
  type TrafficPresenterCommand
} from '../../shared/traffic-presenter'

type NativePresenterModule = typeof native & {
  getTrafficPresenterPath?: () => string
}

let child: ChildProcess | undefined
let desired = false
const expectedExits = new WeakSet<ChildProcess>()
let restartTimer: NodeJS.Timeout | undefined
let operation = Promise.resolve()
let latestTraffic: { up: number; down: number } | undefined
let legacyMonitorMigrated = false

async function migrateLegacyTrafficMonitor(): Promise<void> {
  if (legacyMonitorMigrated || process.platform !== 'win32') return
  legacyMonitorMigrated = true

  const pidPath = `${dataDir()}${sep}monitor.pid`
  try {
    const pid = Number.parseInt(await readFile(pidPath, 'utf8'), 10)
    if (Number.isSafeInteger(pid) && pid > 0) process.kill(pid, 'SIGINT')
  } catch {
    // A previous installation may not have left a running monitor.
  }
  await Promise.all([
    rm(pidPath, { force: true }),
    rm(`${dataDir()}${sep}traffic-monitor`, { recursive: true, force: true })
  ])
}

function executablePath(): string {
  if (app.isPackaged) {
    const filename = `kokorobox-traffic-presenter${process.platform === 'win32' ? '.exe' : ''}`
    const packaged = join(process.resourcesPath, 'traffic-presenter', filename)
    if (!existsSync(packaged)) throw new Error('Traffic presenter is missing from the app bundle')
    return packaged
  }

  const resolver = (native as NativePresenterModule).getTrafficPresenterPath
  if (!resolver)
    throw new Error('Installed kokorobox-native does not include the traffic presenter')
  return resolver()
}

function send(command: TrafficPresenterCommand, target = child): void {
  if (!target?.stdin?.writable) return
  try {
    target.stdin.write(encodeTrafficPresenterCommand(command))
  } catch {
    // The exit/error handler owns recovery when the sidecar closes its input.
  }
}

function configure(target: ChildProcess): void {
  send(
    {
      version: trafficPresenterProtocolVersion,
      type: 'configure',
      visible: true,
      layout: trafficPresenterLayout(process.platform),
      theme: 'system'
    },
    target
  )
  if (latestTraffic) {
    send(
      {
        version: trafficPresenterProtocolVersion,
        type: 'traffic',
        ...latestTraffic
      },
      target
    )
  } else {
    send({ version: trafficPresenterProtocolVersion, type: 'unavailable' }, target)
  }
}

function clearRestartTimer(): void {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = undefined
}

function scheduleRestart(): void {
  clearRestartTimer()
  if (!desired) return
  restartTimer = setTimeout(() => {
    restartTimer = undefined
    void queueReconcile()
  }, 2000)
  restartTimer.unref()
}

function spawnPresenter(): void {
  const executable = executablePath()
  const nextChild = spawn(executable, [], {
    windowsHide: true,
    shell: false,
    stdio: ['pipe', 'ignore', 'pipe']
  })
  child = nextChild

  nextChild.stderr?.setEncoding('utf8')
  nextChild.stderr?.on('data', (chunk: string) => {
    const message = chunk.trim().slice(0, 2000)
    if (message) void appendAppLog(`[Traffic presenter]: ${message}\n`)
  })
  nextChild.stdin?.on('error', () => {})
  nextChild.once('error', (error) => {
    void appendAppLog(`[Traffic presenter]: failed to start, ${error.message}\n`)
  })
  nextChild.once('close', (code, signal) => {
    if (child === nextChild) child = undefined
    if (expectedExits.has(nextChild) || !desired) return
    void appendAppLog(
      `[Traffic presenter]: stopped unexpectedly (code=${code ?? 'none'}, signal=${signal ?? 'none'})\n`
    )
    scheduleRestart()
  })
  configure(nextChild)
}

async function stopPresenter(): Promise<void> {
  clearRestartTimer()
  const running = child
  if (!running) return
  child = undefined
  expectedExits.add(running)
  send({ version: trafficPresenterProtocolVersion, type: 'shutdown' }, running)

  await new Promise<void>((resolve) => {
    if (running.exitCode !== null) {
      resolve()
      return
    }
    const timeout = setTimeout(() => {
      if (running.exitCode === null) running.kill()
      resolve()
    }, 750)
    timeout.unref()
    running.once('close', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

async function reconcile(): Promise<void> {
  await migrateLegacyTrafficMonitor()
  const { showTraffic = false } = await getAppConfig()
  desired = showTraffic
  if (!desired) {
    await stopPresenter()
    return
  }
  if (child && child.exitCode === null) {
    configure(child)
    return
  }
  spawnPresenter()
}

function queueReconcile(): Promise<void> {
  operation = operation.then(reconcile, reconcile)
  return operation
}

export function startTrafficPresenter(): Promise<void> {
  return queueReconcile()
}

export async function stopTrafficPresenter(): Promise<void> {
  desired = false
  operation = operation.then(stopPresenter, stopPresenter)
  await operation
}

export function updateTrafficPresenter(traffic: { up: number; down: number }): void {
  latestTraffic = {
    up: Math.max(0, Math.floor(traffic.up)),
    down: Math.max(0, Math.floor(traffic.down))
  }
  send({ version: trafficPresenterProtocolVersion, type: 'traffic', ...latestTraffic })
}

export function markTrafficPresenterUnavailable(): void {
  latestTraffic = undefined
  send({ version: trafficPresenterProtocolVersion, type: 'unavailable' })
}
