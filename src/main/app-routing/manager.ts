import { BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { appRoutingSupported, validateAppRoutingConfig } from '../../shared/app-routing'
import { getAppConfig } from '../config/app'
import { appendAppLog } from '../utils/log'
import { processRouterDir, processRouterPath } from '../utils/dirs'
import { getAppRoutingConfig, saveAppRoutingConfig } from './config'
import { appRoutingSocksPort, buildProcessRouterCommand } from './profile'
import { prepareAppRoutingConfig } from './rules'
import { canConnectToAppRoutingListener } from './health'
import { verifyProcessRouterIntegrity } from './integrity'
import { parseProcessRouterEvent } from './protocol'

const probeIntervalMs = 3000
const restartDelayMs = 1500
const commandTimeoutMs = 5000
let child: ChildProcess | undefined
let activePort: number | undefined
let rulesApplied = false
let activePolicyKey = ''
let pendingPolicyKey = ''
let pendingPolicyStartedAt = 0
let monitor: NodeJS.Timeout | undefined
let restartTimer: NodeJS.Timeout | undefined
let stopping = false
const expectedExits = new WeakSet<ChildProcess>()
let operation: Promise<void> = Promise.resolve()
let configGeneration = 0
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
    rulesApplied = false
    activePolicyKey = ''
    pendingPolicyKey = ''
    pendingPolicyStartedAt = 0
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
  rulesApplied = false
  activePolicyKey = ''
  pendingPolicyKey = ''
  pendingPolicyStartedAt = 0
}

async function startChild(
  config: AppRoutingConfig,
  port: number,
  requiresMihomo: boolean,
  mihomoAvailable: boolean,
  policyKey: string
): Promise<void> {
  publishStatus({
    supported: true,
    state: 'starting',
    proxyPort: requiresMihomo ? port : undefined,
    mihomoAvailable,
    protectedApplicationCount: requiresMihomo
      ? config.rules.filter((rule) => rule.enabled && rule.action === 'proxy').length
      : 0
  })
  const executable = processRouterPath()
  const nextChild = spawn(executable, [], {
    cwd: processRouterDir(),
    windowsHide: true,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  child = nextChild
  rulesApplied = false
  activePolicyKey = ''
  pendingPolicyKey = policyKey
  pendingPolicyStartedAt = Date.now()
  activePort = port
  let outputBuffer = ''
  nextChild.stdout?.setEncoding('utf8')
  nextChild.stdout?.on('data', (chunk: string) => {
    outputBuffer += chunk
    const lines = outputBuffer.split('\n')
    outputBuffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = parseProcessRouterEvent(line)
        if (event.event === 'rules_replaced') {
          rulesApplied = true
          activePolicyKey = pendingPolicyKey
          pendingPolicyKey = ''
          pendingPolicyStartedAt = 0
          void reconcileAppRouting()
        }
        if (event.event === 'error') {
          rulesApplied = false
          pendingPolicyKey = ''
          pendingPolicyStartedAt = 0
          void appendAppLog(`[App routing]: router command failed, ${event.message || 'unknown'}\n`)
        }
      } catch {
        void appendAppLog('[App routing]: rejected incompatible router output\n')
        if (nextChild.exitCode === null) nextChild.kill()
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
  sendRouterCommand(nextChild, buildProcessRouterCommand(config, mihomoAvailable))
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
  const mihomoAvailable = requiresMihomo ? await canConnectToAppRoutingListener(proxyPort) : false
  const policyKey = `${configGeneration}:${requiresMihomo ? Number(mihomoAvailable) : 'direct'}`
  if (
    child &&
    child.exitCode === null &&
    pendingPolicyKey &&
    Date.now() - pendingPolicyStartedAt > commandTimeoutMs
  ) {
    await appendAppLog('[App routing]: process router command timed out\n')
    child.kill()
    return
  }
  if (!child || child.exitCode !== null || activePort !== proxyPort) {
    await stopChild()
    try {
      await verifyProcessRouterIntegrity()
    } catch (error) {
      await appendAppLog(`[App routing]: process router integrity check failed, ${error}\n`)
      publishStatus({
        supported: true,
        state: 'error',
        message: 'Windows 封包拦截组件缺失或已损坏',
        mihomoAvailable,
        protectedApplicationCount: config.rules.filter(
          (rule) => rule.enabled && rule.action === 'proxy'
        ).length
      })
      return
    }
    await startChild(config, proxyPort, requiresMihomo, mihomoAvailable, policyKey)
  } else if (activePolicyKey !== policyKey && pendingPolicyKey !== policyKey) {
    rulesApplied = false
    pendingPolicyKey = policyKey
    pendingPolicyStartedAt = Date.now()
    publishStatus({
      supported: true,
      state: 'starting',
      proxyPort: requiresMihomo ? proxyPort : undefined,
      mihomoAvailable,
      protectedApplicationCount: config.rules.filter(
        (rule) => rule.enabled && rule.action === 'proxy'
      ).length
    })
    sendRouterCommand(child, buildProcessRouterCommand(config, mihomoAvailable))
  }
  const protectedApplicationCount = config.rules.filter(
    (rule) => rule.enabled && rule.action === 'proxy'
  ).length
  publishStatus({
    supported: true,
    state: !rulesApplied ? 'starting' : requiresMihomo && !mihomoAvailable ? 'degraded' : 'running',
    message:
      !rulesApplied || !requiresMihomo || mihomoAvailable
        ? undefined
        : '代理核心不可用，受保护应用的网络连接已封锁',
    proxyPort: requiresMihomo ? proxyPort : undefined,
    mihomoAvailable,
    protectedApplicationCount
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
