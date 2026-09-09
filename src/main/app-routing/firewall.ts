import { execWithElevation } from '../utils/elevation'
import { servicePath } from '../utils/dirs'
import { execFile } from 'child_process'
import { promisify } from 'util'

export const appRoutingFirewallProbeIntervalMs = 30_000
const execFilePromise = promisify(execFile)

async function runFirewallCommand(command: 'ensure' | 'check' | 'remove'): Promise<void> {
  if (process.platform !== 'win32') return
  const args = ['process-router', 'firewall', command]
  if (command === 'check') {
    await execFilePromise(servicePath(), args, { timeout: 20_000, windowsHide: true })
    return
  }
  await execWithElevation(servicePath(), args)
}

export async function ensureAppRoutingFirewall(): Promise<void> {
  try {
    await runFirewallCommand('ensure')
  } catch (error) {
    throw new Error(
      `无法建立或验证 Windows 应用分流防火墙规则：${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function checkAppRoutingFirewall(): Promise<void> {
  try {
    await runFirewallCommand('check')
  } catch (error) {
    throw new Error(
      `Windows 应用分流防火墙规则缺失或未生效：${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function removeAppRoutingFirewall(): Promise<void> {
  try {
    await runFirewallCommand('remove')
  } catch (error) {
    throw new Error(
      `无法移除 Windows 应用分流防火墙规则：${error instanceof Error ? error.message : String(error)}`
    )
  }
}
