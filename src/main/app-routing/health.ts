import { Socket } from 'net'

export function isSuccessfulSocks5Greeting(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x05 && data[1] === 0x00
}

export async function canConnectToAppRoutingListener(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    const finish = (available: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(available)
    }
    socket.setTimeout(700)
    socket.once('connect', () => socket.write(Buffer.from([0x05, 0x01, 0x00])))
    socket.once('data', (data) =>
      finish(typeof data !== 'string' && isSuccessfulSocks5Greeting(data))
    )
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, '127.0.0.1')
  })
}
