import { clearTerminalProxyEnvironment, setTerminalProxyEnvironment } from 'kokorobox-native'
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
  if (sessionUpdated === null) return
  updateCurrentProcessEnvironment()
  if (!sessionUpdated) {
    await appendAppLog('[Sysproxy]: systemd user manager unavailable for terminal proxy\n')
  }
}
