import { BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { mkdir, rename, unlink, writeFile } from 'fs/promises'
import { Socket } from 'net'
import { spawn, type ChildProcess } from 'child_process'
import {
  appRoutingSupported,
  buildProxyBridgeProfile,
  resolveMihomoSocksPort,
  validateAppRoutingConfig
} from '../../shared/app-routing'
import { getAppConfig } from '../config/app'
import { getControledMihomoConfig } from '../config/controledMihomo'
import { appendAppLog } from '../utils/log'
import {
  appRoutingDir,
  appRoutingProfilePath,
  proxyBridgeDir,
  proxyBridgePath
} from '../utils/dirs'
import { getAppRoutingConfig, saveAppRoutingConfig } from './config'

const probeIntervalMs = 3000
const restartDelayMs = 1500
let child: ChildProcess | undefined
let activePort: number | undefined
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

async function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    const finish = (available: boolean): void => {
      socket.destroy()
      resolve(available)
    }
    socket.setTimeout(700)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, '127.0.0.1')
  })
}

async function writeProfile(config: AppRoutingConfig, port: number): Promise<void> {
  await mkdir(appRoutingDir(), { recursive: true })
  const temporaryPath = `${appRoutingProfilePath()}.tmp`
  await writeFile(temporaryPath, `${buildProxyBridgeProfile(config, port)}\n`, 'utf8')
  if (process.platform === 'win32' && existsSync(appRoutingProfilePath())) {
    await unlink(appRoutingProfilePath())
  }
  await rename(temporaryPath, appRoutingProfilePath())
}

function clearRestartTimer(): void {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = undefined
}

async function stopChild(): Promise<void> {
  clearRestartTimer()
  const runningChild = child
  if (!runningChild || runningChild.exitCode !== null) {
    child = undefined
    activePort = undefined
    activeGeneration = -1
    return
  }
  expectedExits.add(runningChild)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out while stopping the packet interception sidecar')),
      2000
    )
    runningChild.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    if (!runningChild.kill()) {
      clearTimeout(timeout)
      reject(new Error('Unable to stop the packet interception sidecar'))
    }
  })
  if (child === runningChild) child = undefined
  activePort = undefined
  activeGeneration = -1
}

async function startChild(
  config: AppRoutingConfig,
  port: number,
  requiresMihomo: boolean
): Promise<void> {
  await writeProfile(config, port)
  publishStatus({
    supported: true,
    state: 'starting',
    proxyPort: requiresMihomo ? port : undefined,
    mihomoAvailable: requiresMihomo ? await canConnect(port) : false
  })
  const executable = proxyBridgePath()
  const nextChild = spawn(executable, ['--profile', appRoutingProfilePath(), '--verbose', '0'], {
    cwd: proxyBridgeDir(),
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child = nextChild
  activePort = port
  activeGeneration = configGeneration
  nextChild.stdout?.resume()
  nextChild.stderr?.resume()
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
  const configuredProxyPort = resolveMihomoSocksPort(await getControledMihomoConfig())
  if (requiresMihomo && !configuredProxyPort) {
    await stopChild()
    publishStatus({
      supported: true,
      state: 'error',
      message: '请先启用本机 Mihomo SOCKS 或 mixed 监听端口',
      mihomoAvailable: false
    })
    return
  }
  // ProxyBridge requires one syntactically valid proxy config even when every active rule is
  // Direct or Block. Port 1 is an unreachable placeholder and is never referenced in that case.
  const proxyPort = requiresMihomo ? configuredProxyPort! : 1
  if (
    !child ||
    child.exitCode !== null ||
    activePort !== proxyPort ||
    activeGeneration !== configGeneration
  ) {
    await stopChild()
    await startChild(config, proxyPort, requiresMihomo)
  }
  const mihomoAvailable = requiresMihomo ? await canConnect(proxyPort) : false
  publishStatus({
    supported: true,
    state: !requiresMihomo || mihomoAvailable ? 'running' : 'degraded',
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
  const saved = await saveAppRoutingConfig(config)
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
