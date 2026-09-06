import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { macAppRoutingBridgePath, macAppRoutingExtensionPath } from '../utils/dirs'
import { appRoutingSocksPort } from './profile'
import { buildMacAppRoutingConfiguration, type MacBridgeConfiguration } from './macos-profile'

const bridgeTimeoutMs = 330_000
let activePolicyKey = ''

interface MacBridgeResponse {
  version: 1
  ok: boolean
  state: 'disabled' | 'starting' | 'running' | 'stopping' | 'error'
  needsUserApproval: boolean
  message?: string
}

async function invokeBridge(
  command: 'apply' | 'stop' | 'status' | 'open-settings',
  configuration?: MacBridgeConfiguration
): Promise<MacBridgeResponse> {
  const executable = macAppRoutingBridgePath()
  if (!existsSync(executable)) throw new Error('macOS application-routing bridge is not installed')
  if (command === 'apply' && !existsSync(macAppRoutingExtensionPath())) {
    throw new Error('macOS application-routing system extension is not installed')
  }
  return await new Promise<MacBridgeResponse>((resolve, reject) => {
    const child = spawn(executable, [], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore']
    })
    let output = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('macOS application-routing bridge timed out'))
    }, bridgeTimeoutMs)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (output.length + chunk.length <= 64 * 1024) output += chunk
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', () => {
      clearTimeout(timeout)
      try {
        const response = JSON.parse(output) as MacBridgeResponse
        if (
          response.version !== 1 ||
          typeof response.ok !== 'boolean' ||
          !['disabled', 'starting', 'running', 'stopping', 'error'].includes(response.state) ||
          typeof response.needsUserApproval !== 'boolean'
        ) {
          throw new Error('Unsupported macOS application-routing bridge response')
        }
        if (!response.ok) throw new Error(response.message || 'macOS application routing failed')
        resolve(response)
      } catch (error) {
        reject(error)
      }
    })
    child.stdin.end(
      JSON.stringify({
        version: 1,
        command,
        ...(configuration ? { configuration } : {})
      })
    )
  })
}

export async function reconcileMacAppRouting(
  config: AppRoutingConfig,
  proxyAvailable: boolean
): Promise<AppRoutingStatus> {
  const configuration = buildMacAppRoutingConfiguration(config, proxyAvailable)
  const policyKey = JSON.stringify(configuration)
  let response = await invokeBridge('status')
  if (
    policyKey !== activePolicyKey ||
    response.state === 'disabled' ||
    response.state === 'error'
  ) {
    response = await invokeBridge('apply', configuration)
    activePolicyKey = response.state === 'running' ? policyKey : ''
  }
  const protectedApplicationCount = config.rules.filter(
    (rule) => rule.enabled && rule.action === 'proxy'
  ).length
  return {
    supported: true,
    state: response.state === 'stopping' ? 'starting' : response.state,
    message: response.needsUserApproval
      ? '请在系统设置中允许 KokoroBox 网络扩展'
      : !proxyAvailable && protectedApplicationCount > 0
        ? '代理核心不可用，受保护应用的网络连接已封锁'
        : undefined,
    proxyPort: appRoutingSocksPort,
    mihomoAvailable: proxyAvailable,
    protectedApplicationCount
  }
}

export async function stopMacAppRouting(): Promise<void> {
  activePolicyKey = ''
  if (!existsSync(macAppRoutingBridgePath())) return
  await invokeBridge('stop')
}

export async function openMacAppRoutingSystemSettings(): Promise<void> {
  if (!existsSync(macAppRoutingBridgePath())) {
    throw new Error('macOS application-routing bridge is not installed')
  }
  await invokeBridge('open-settings')
}
