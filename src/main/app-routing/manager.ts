import { BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import {
  appRoutingSupported,
  buildProcessRouterCommand,
  validateAppRoutingConfig
} from '../../shared/app-routing'
import { getAppConfig } from '../config/app'
import { appendAppLog } from '../utils/log'
import { proxyBridgeDir, proxyBridgePath } from '../utils/dirs'
import { getAppRoutingConfig, saveAppRoutingConfig } from './config'
import { appRoutingSocksPort } from './profile'
import { prepareAppRoutingConfig } from './rules'
import { canConnectToAppRoutingListener } from './health'

const probeIntervalMs = 3000
const restartDelayMs = 1500
let child: ChildProcess | undefined
let activePort: number | undefined
let rulesApplied = false
let monitor: NodeJS.Timeout | undefined
let restartTimer: NodeJS.Timeout | undefined
let stopping = false
const expectedExits = new WeakSet<ChildProcess>()
let operation: Promise<void> = Promise.resolve()
let configGeneration = 0
let activeGeneration = -1
let status: AppRoutingStatus = {
  supported: appRoutingSupported(process.platform, process.arch),
  state: appRoutingSupported(process.platform, process.arch) ? 'disabled' : 'unsupported',
  mihomoAvailable: false
}

function publishStatus(next: AppRoutingStatus): void {
  status = next
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('app-routing-status-changed', status)
  }
}

function clearRestartTimer(): void {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = undefined
}

function sendRouterCommand(target: ChildProcess, command: string): void {
  if (!target.stdin?.writable) throw new Error('Packet interception control channel is unavailable')
  target.stdin.write(`${command}\n`)
}

async function stopChild(): Promise<void> {
  clearRestartTimer()
  const runningChild = child
  if (!runningChild || runningChild.exitCode !== null) {
    child = undefined
    activePort = undefined
    activeGeneration = -1
    rulesApplied = false
    return
  }
  expectedExits.add(runningChild)
  if (runningChild.stdin?.writable) {
    sendRouterCommand(runningChild, '{"version":1,"command":"shutdown"}')
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out while stopping the packet interception sidecar')),
      2000
    )
    runningChild.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    setTimeout(() => {
      if (runningChild.exitCode === null) runningChild.kill()
    }, 500).unref()
  })
  if (child === runningChild) child = undefined
  activePort = undefined
  activeGeneration = -1
  rulesApplied = false
}

async function startChild(
  config: AppRoutingConfig,
  port: number,
  requiresMihomo: boolean
): Promise<void> {
  publishStatus({
    supported: true,
    state: 'starting',
    proxyPort: requiresMihomo ? port : undefined,
    mihomoAvailable: requiresMihomo ? await canConnectToAppRoutingListener(port) : false
  })
  const executable = proxyBridgePath()
  const nextChild = spawn(executable, [], {
    cwd: proxyBridgeDir(),
    windowsHide: true,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  child = nextChild
  rulesApplied = false
  activePort = port
  activeGeneration = configGeneration
  let outputBuffer = ''
  nextChild.stdout?.setEncoding('utf8')
  nextChild.stdout?.on('data', (chunk: string) => {
    outputBuffer += chunk
    const lines = outputBuffer.split('\n')
    outputBuffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line) as { version?: number; event?: string; message?: string }
        if (event.version !== 1) continue
        if (event.event === 'rules_replaced') {
          rulesApplied = true
          void reconcileAppRouting()
        }
        if (event.event === 'error') {
          rulesApplied = false
          void appendAppLog(`[App routing]: router command failed, ${event.message || 'unknown'}\n`)
        }
      } catch {
        void appendAppLog('[App routing]: ignored malformed router output\n')
      }
    }
  })
  nextChild.stderr?.setEncoding('utf8')
  nextChild.stderr?.on('data', (chunk: string) => {
    void appendAppLog(`[App routing]: router error, ${chunk.slice(0, 1000)}\n`)
  })
  let terminationHandled = false
  const handleTermination = (message: string): void => {
    if (terminationHandled) return
    terminationHandled = true
    if (child === nextChild) child = undefined
    if (stopping || expectedExits.has(nextChild)) return
    publishStatus({
      supported: true,
      state: 'error',
      message,
      proxyPort: requiresMihomo ? port : undefined,
      mihomoAvailable: status.mihomoAvailable
    })
    restartTimer = setTimeout(() => {
      void reconcileAppRouting()
    }, restartDelayMs)
  }
  nextChild.once('error', (error) => {
    void appendAppLog(`[App routing]: sidecar failed to start, ${error.message}\n`)
    handleTermination('封包拦截组件启动失败')
  })
  nextChild.once('exit', () => {
    handleTermination('封包拦截组件意外停止，正在重试')
  })
  nextChild.stdin?.on('error', () => {
    if (nextChild.exitCode === null) nextChild.kill()
  })
  sendRouterCommand(nextChild, buildProcessRouterCommand(config, port))
}

async function reconcile(): Promise<void> {
  if (!appRoutingSupported(process.platform, process.arch)) {
    publishStatus({ supported: false, state: 'unsupported', mihomoAvailable: false })
    return
  }
  const config = await getAppRoutingConfig()
  validateAppRoutingConfig(config)
  const enabledRules = config.rules.filter((rule) => rule.enabled)
  if (!config.enabled || enabledRules.length === 0) {
    await stopChild()
    publishStatus({
      supported: true,
      state: 'disabled',
      message: config.enabled ? '添加或启用规则以启动应用分流' : undefined,
      mihomoAvailable: false
    })
    return
  }
  if (!existsSync(proxyBridgePath())) {
    await stopChild()
    publishStatus({
      supported: true,
      state: 'error',
      message: 'Windows 封包拦截组件未安装',
      mihomoAvailable: false
    })
    return
  }
  const { corePermissionMode = 'elevated' } = await getAppConfig()
  if (corePermissionMode === 'service') {
    await stopChild()
    publishStatus({
      supported: true,
      state: 'error',
      message: '应用分流 MVP 需要以管理员模式运行 KokoroBox',
      mihomoAvailable: false
    })
    return
  }
  const requiresMihomo = enabledRules.some((rule) => rule.action === 'proxy')
  const proxyPort = appRoutingSocksPort
  if (!child || child.exitCode !== null || activePort !== proxyPort) {
    await stopChild()
    await startChild(config, proxyPort, requiresMihomo)
  } else if (activeGeneration !== configGeneration) {
    rulesApplied = false
    publishStatus({
      supported: true,
      state: 'starting',
      proxyPort: requiresMihomo ? proxyPort : undefined,
      mihomoAvailable: requiresMihomo ? await canConnectToAppRoutingListener(proxyPort) : false
    })
    sendRouterCommand(child, buildProcessRouterCommand(config, proxyPort))
    activeGeneration = configGeneration
  }
  const mihomoAvailable = requiresMihomo ? await canConnectToAppRoutingListener(proxyPort) : false
  publishStatus({
    supported: true,
    state: !rulesApplied ? 'starting' : !requiresMihomo || mihomoAvailable ? 'running' : 'degraded',
    message:
      !requiresMihomo || mihomoAvailable
        ? undefined
        : 'Mihomo 不可用；匹配 Proxy 的流量已阻断（不会直连）',
    proxyPort: requiresMihomo ? proxyPort : undefined,
    mihomoAvailable
  })
}

export function reconcileAppRouting(): Promise<void> {
  const next = operation.then(reconcile, reconcile)
  operation = next.catch((error) => {
    publishStatus({
      supported: appRoutingSupported(process.platform, process.arch),
      state: 'error',
      message: error instanceof Error ? error.message : String(error),
      proxyPort: activePort,
      mihomoAvailable: false
    })
  })
  return operation
}

export async function initializeAppRouting(): Promise<void> {
  if (!appRoutingSupported(process.platform, process.arch)) return
  stopping = false
  await reconcileAppRouting()
  monitor = setInterval(() => void reconcileAppRouting(), probeIntervalMs)
  monitor.unref()
}

export async function replaceAppRoutingConfig(config: AppRoutingConfig): Promise<AppRoutingConfig> {
  const saved = await saveAppRoutingConfig(await prepareAppRoutingConfig(config))
  configGeneration++
  await reconcileAppRouting()
  return saved
}

export function getAppRoutingStatus(): AppRoutingStatus {
  return { ...status }
}

export async function stopAppRouting(): Promise<void> {
  stopping = true
  if (monitor) clearInterval(monitor)
  monitor = undefined
  await stopChild()
}
