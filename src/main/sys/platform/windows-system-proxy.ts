import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { listUwpLoopbackApps } from 'kokorobox-native'
import type {
  SystemProxyDiagnosticInput,
  WindowsUserProxy
} from '../../../shared/system-proxy-diagnostics'

const runFile = promisify(execFile)
const commandOptions = { windowsHide: true, timeout: 4000, maxBuffer: 64 * 1024 }

function systemExecutable(name: string): string {
  return path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', name)
}

export function parseWindowsProxyRegistry(output: string): WindowsUserProxy {
  const read = (name: string): string => {
    const match = new RegExp(
      `^[ \\t]*${name}[ \\t]+REG_(?:SZ|EXPAND_SZ|DWORD)[ \\t]*(.*?)[ \\t]*\\r?$`,
      'mi'
    ).exec(output)
    return match?.[1] || ''
  }
  return {
    enabled: Number(read('ProxyEnable')) === 1,
    server: read('ProxyServer'),
    override: read('ProxyOverride'),
    pacUrl: read('AutoConfigURL')
  }
}

export async function readWindowsUserProxy(): Promise<WindowsUserProxy> {
  // The native package/service has no API for these four raw current-user values.
  // Fixed arguments, no shell, no elevation, and no writes. Empty values are normal.
  const { stdout } = await runFile(
    systemExecutable('reg.exe'),
    ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
    commandOptions
  )
  return parseWindowsProxyRegistry(stdout)
}

export function parseWinHttpDump(
  output: string
): NonNullable<SystemProxyDiagnosticInput['winHttp']> {
  // Dump emits netsh command syntax independent of the localized display labels.
  // Never execute the emitted script or return it to the UI.
  if (/^\s*set\s+advproxy\b/im.test(output)) return { mode: 'advanced' }
  const proxy = /^\s*set\s+proxy\s+(?:proxy-server=)?(?:"([^"]*)"|(\S+))/im.exec(output)
  if (proxy) return { mode: 'proxy', server: proxy[1] ?? proxy[2] }
  if (/^\s*reset\s+proxy\s*$/im.test(output)) return { mode: 'direct' }
  return { mode: 'unknown' }
}

export async function readWinHttpProxy(): Promise<
  NonNullable<SystemProxyDiagnosticInput['winHttp']>
> {
  const { stdout } = await runFile(
    systemExecutable('netsh.exe'),
    ['winhttp', 'dump'],
    commandOptions
  )
  return parseWinHttpDump(stdout)
}

export function readLoopbackExemptionCount(): number {
  return listUwpLoopbackApps().filter((app) => app.enabled).length
}
