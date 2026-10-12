import WebSocket from 'ws'
import { validateServiceProcessRouterStatus } from '../app-routing/service-protocol'
import type { ServiceProcessRouterStatus } from './api'

export function createProcessRouterEventStream(
  onStatus: (status: ServiceProcessRouterStatus) => void,
  onConnected: () => void,
  connect: () => WebSocket,
  onError: (error: unknown) => void = () => {},
  heartbeatMs = 5000,
  onDisconnected: () => void = () => {}
) {
  let socket: WebSocket | undefined
  let reconnect: NodeJS.Timeout | undefined
  let heartbeat: NodeJS.Timeout | undefined
  let stopped = true
  const clearHeartbeat = (): void => {
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = undefined
  }
  const open = (): void => {
    if (stopped || socket) return
    let ws: WebSocket
    try {
      ws = connect()
    } catch (error) {
      retry(error)
      return
    }
    socket = ws
    ws.on('open', () => {
      if (socket !== ws || stopped) return
      // Incoming status messages do not prove that Desktop is still alive.
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping()
      }, heartbeatMs)
      heartbeat.unref()
      onConnected()
    })
    ws.on('message', (data) => {
      if (stopped || socket !== ws) return
      try {
        if (data.toString().length > 64 * 1024) throw new Error('Router status is too large')
        onStatus(validateServiceProcessRouterStatus(JSON.parse(data.toString()), process.platform))
      } catch (error) {
        onError(error)
      }
    })
    ws.on('error', () => {
      /* Close handles reconnection without changing desired policy. */
    })
    ws.on('close', () => {
      if (socket !== ws) return
      socket = undefined
      clearHeartbeat()
      onDisconnected()
      retry()
    })
  }
  const retry = (error?: unknown): void => {
    if (stopped || reconnect) return
    if (error) {
      onError(error)
      onDisconnected()
    }
    reconnect = setTimeout(() => {
      reconnect = undefined
      open()
    }, 2000)
    reconnect.unref()
  }
  return {
    start(): void {
      stopped = false
      open()
    },
    stop(): void {
      stopped = true
      if (reconnect) clearTimeout(reconnect)
      reconnect = undefined
      clearHeartbeat()
      const ws = socket
      socket = undefined
      ws?.terminate()
    }
  }
}
