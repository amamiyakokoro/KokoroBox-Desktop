import { clearTerminalProxyEnvironment, setTerminalProxyEnvironment } from 'kokorobox-native'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getAppConfig, getControledMihomoConfig } from '../config'
import { defaultSystemProxyBypass, normalizeProxyHost } from '../../shared/system-proxy'
import { appendAppLog } from '../utils/log'

const environmentNames = [
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY'
] as const

function updateCurrentProcessEnvironment(values?: Record<string, string>): void {
  for (const name of environmentNames) {
    if (values) process.env[name] = values[name]
    else delete process.env[name]
  }
}

// Older Native versions skip UnsetEnvironment when the managed file is gone.
// Recover only values matching our configured endpoint, preserving other proxies.
async function clearStaleTerminalProxyEnvironment(): Promise<void> {
  const [{ sysProxy }, { 'mixed-port': port = 7890 }] = await Promise.all([
    getAppConfig(),
    getControledMihomoConfig()
  ])
  if (!port) return
  const proxy = `http://${normalizeProxyHost(sysProxy.host || '')}:${port}`
  const bypass = (sysProxy.bypass ?? defaultSystemProxyBypass('linux')).join(',')
  const ownedNames = (values: Record<string, string | undefined>): string[] => {
    const names = environmentNames.filter(
      (name) => name !== 'no_proxy' && name !== 'NO_PROXY' && values[name] === proxy
    ) as string[]
    if (names.length) {
      for (const name of ['no_proxy', 'NO_PROXY']) {
        if (values[name] === bypass) names.push(name)
      }
    }
    return names
  }
  for (const name of ownedNames(process.env)) delete process.env[name]

  const run = promisify(execFile)
  const options = { timeout: 3000, maxBuffer: 64 * 1024, windowsHide: true }
  let output: string
  try {
    output = (await run('systemctl', ['--user', 'show-environment', '--output=json'], options))
      .stdout
  } catch {
    await appendAppLog('[Sysproxy]: systemd user manager unavailable for terminal proxy\n')
    return
  }
  let values: Record<string, string>
  try {
    values = JSON.parse(output)
    if (!values || Array.isArray(values) || typeof values !== 'object') throw new Error()
  } catch {
    throw new Error('Invalid systemd terminal proxy environment response')
  }
  const names = ownedNames(values)
  if (names.length) {
    try {
      await run('systemctl', ['--user', 'unset-environment', ...names], options)
    } catch {
      throw new Error('Failed to clear stale terminal proxy environment')
    }
  }
}

export async function enableTerminalProxy(
  host: string,
  port: number,
  bypass: string[]
): Promise<void> {
  if (process.platform !== 'linux') return

  const proxy = `http://${host}:${port}`
  const noProxy = bypass.join(',')
  const values: Record<string, string> = {
    http_proxy: proxy,
    https_proxy: proxy,
    all_proxy: proxy,
    no_proxy: noProxy,
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    NO_PROXY: noProxy
  }

  const sessionUpdated = await setTerminalProxyEnvironment(host, port, bypass)
  updateCurrentProcessEnvironment(values)
  if (!sessionUpdated) {
    await appendAppLog('[Sysproxy]: systemd user manager unavailable for terminal proxy\n')
  }
}

export async function disableTerminalProxy(): Promise<void> {
  if (process.platform !== 'linux') return

  const sessionUpdated = await clearTerminalProxyEnvironment()
  if (sessionUpdated === null) {
    await clearStaleTerminalProxyEnvironment()
    return
  }
  updateCurrentProcessEnvironment()
  if (!sessionUpdated) {
    await appendAppLog('[Sysproxy]: systemd user manager unavailable for terminal proxy\n')
  }
}
