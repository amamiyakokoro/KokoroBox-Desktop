import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import type { ConnectivityResult } from '../../shared/system-proxy-diagnostics'

export function validProxyPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535
}

export async function probeProxyListener(
  host: string,
  port: number,
  timeoutMs = 1200
): Promise<boolean> {
  if (!validProxyPort(port)) return false
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const finish = (available: boolean): void => {
      clearTimeout(timer)
      socket.destroy()
      resolve(available)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

// A fixed public 204 endpoint, also used by Mihomo delay tests. No direct fallback,
// OS proxy auto-resolution, redirects, credentials or environment proxy variables.
export async function probeProxyConnectivity(
  host: string,
  port: number,
  timeoutMs = 5000
): Promise<ConnectivityResult> {
  if (!validProxyPort(port)) return { outcome: 'unreachable', reason: 'invalid-port' }
  return new Promise((resolve) => {
    let settled = false
    let reachedProxy = false
    let tunnel: net.Socket | undefined
    let outbound: http.ClientRequest | undefined
    let agent: https.Agent | undefined
    const finish = (result: ConnectivityResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      outbound?.destroy()
      connect.destroy()
      tunnel?.destroy()
      agent?.destroy()
      resolve(result)
    }
    const failed = (reason: ConnectivityResult['reason']): void =>
      finish({ outcome: reachedProxy ? 'outbound-failed' : 'unreachable', reason })
    const connect = http.request({
      host,
      port,
      method: 'CONNECT',
      path: 'www.gstatic.com:443',
      agent: false,
      headers: { Host: 'www.gstatic.com:443' }
    })
    const timer = setTimeout(() => failed('timeout'), timeoutMs)
    connect.on('socket', (socket) =>
      socket.once('connect', () => {
        reachedProxy = true
      })
    )
    connect.once('error', (error: NodeJS.ErrnoException) =>
      failed(error.code === 'ECONNREFUSED' ? 'connection-refused' : 'network-error')
    )
    connect.once('connect', (response, socket, head) => {
      tunnel = socket
      if (settled) {
        socket.destroy()
        return
      }
      reachedProxy = true
      if (response.statusCode !== 200) {
        failed(response.statusCode === 407 ? 'proxy-authentication' : 'tunnel-rejected')
        return
      }
      if (head.length) socket.unshift(head)
      agent = new https.Agent({ keepAlive: false })
      agent.createConnection = () =>
        tls.connect({ socket, servername: 'www.gstatic.com', rejectUnauthorized: true })
      outbound = https.request(
        'https://www.gstatic.com/generate_204',
        { agent, method: 'GET', headers: { 'User-Agent': 'KokoroBox-SystemProxyDiagnostics' } },
        (result) => {
          const ok = result.statusCode === 204
          result.destroy()
          finish(
            ok
              ? { outcome: 'success' }
              : { outcome: 'outbound-failed', reason: 'unexpected-response' }
          )
        }
      )
      outbound.once('error', (error: NodeJS.ErrnoException) =>
        failed(/CERT|TLS|SSL/.test(error.code || '') ? 'tls-failed' : 'network-error')
      )
      outbound.end()
    })
    // Some proxies return a regular HTTP error rather than accepting CONNECT.
    connect.once('response', (response) => {
      reachedProxy = true
      response.destroy()
      failed(response.statusCode === 407 ? 'proxy-authentication' : 'tunnel-rejected')
    })
    connect.end()
  })
}
