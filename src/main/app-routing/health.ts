import { Socket } from 'net'

export async function canConnectToAppRoutingListener(port: number): Promise<boolean> {
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
