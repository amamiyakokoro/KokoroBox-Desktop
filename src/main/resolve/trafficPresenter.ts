import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { sep } from 'path'
import * as native from 'kokorobox-native'
import { getAppConfig } from '../config'
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
let expectedExit = false
let restartTimer: NodeJS.Timeout | undefined
let operation = Promise.resolve()
let latestTraffic: { up: number; down: number } | undefined

function executablePath(): string {
  const resolver = (native as NativePresenterModule).getTrafficPresenterPath
  if (!resolver)
    throw new Error('Installed kokorobox-native does not include the traffic presenter')

  const resolved = resolver()
  if (!app.isPackaged) return resolved

  const archiveSegment = `${sep}app.asar${sep}`
  const unpacked = resolved.replace(archiveSegment, `${sep}app.asar.unpacked${sep}`)
  return existsSync(unpacked) ? unpacked : resolved
}

function send(command: TrafficPresenterCommand, target = child): void {
  if (!target?.stdin?.writable) return
  target.stdin.write(encodeTrafficPresenterCommand(command))
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
  expectedExit = false

  nextChild.stderr?.setEncoding('utf8')
  nextChild.stderr?.on('data', (chunk: string) => {
    const message = chunk.trim().slice(0, 2000)
    if (message) void appendAppLog(`[Traffic presenter]: ${message}\n`)
  })
  nextChild.stdin?.on('error', () => {})
  nextChild.once('error', (error) => {
    void appendAppLog(`[Traffic presenter]: failed to start, ${error.message}\n`)
  })
  nextChild.once('exit', (code, signal) => {
    if (child === nextChild) child = undefined
    if (expectedExit || !desired) return
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
  expectedExit = true
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
    running.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

async function reconcile(): Promise<void> {
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
