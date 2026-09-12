import { execFile } from 'node:child_process'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { appendAppLog } from '../utils/log'

const execFilePromise = promisify(execFile)
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

function terminalProxyConfigPath(): string {
  const configured = process.env.XDG_CONFIG_HOME
  const configHome = configured && isAbsolute(configured) ? configured : join(homedir(), '.config')
  return join(configHome, 'environment.d', '90-kokorobox-proxy.conf')
}

function quoteEnvironmentValue(value: string): string {
  if (/[\0\r\n]/.test(value)) {
    throw new Error('Terminal proxy environment contains an invalid line break')
  }
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('`', '\\`')
    .replaceAll('$', '$$')}"`
}

async function updateUserManagerEnvironment(values?: Record<string, string>): Promise<void> {
  try {
    if (values) {
      await execFilePromise('systemctl', [
        '--user',
        'set-environment',
        ...environmentNames.map((name) => `${name}=${values[name]}`)
      ])
    } else {
      await execFilePromise('systemctl', ['--user', 'unset-environment', ...environmentNames])
    }
  } catch (error) {
    await appendAppLog(`[Sysproxy]: update terminal proxy session environment failed, ${error}\n`)
  }
}

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
  const configPath = terminalProxyConfigPath()
  const temporaryPath = `${configPath}.${process.pid}.tmp`
  const content = [
    '# Managed by KokoroBox. Changes will be overwritten.',
    ...environmentNames.map((name) => `${name}=${quoteEnvironmentValue(values[name])}`),
    ''
  ].join('\n')

  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 })
  await rename(temporaryPath, configPath)
  updateCurrentProcessEnvironment(values)
  await updateUserManagerEnvironment(values)
}

export async function disableTerminalProxy(): Promise<void> {
  if (process.platform !== 'linux') return

  const configPath = terminalProxyConfigPath()
  let managedConfig = false
  try {
    managedConfig = (await readFile(configPath, 'utf8')).startsWith('# Managed by KokoroBox.')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    await unlink(configPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (managedConfig) updateCurrentProcessEnvironment()
  await updateUserManagerEnvironment()
}
