import http from 'node:http'
import type { AddressInfo } from 'node:net'

const pacHost = '127.0.0.1'

export class PacHttpServer {
  private server: http.Server | undefined
  private script: string | undefined
  private pending: Promise<void> = Promise.resolve()

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation)
    this.pending = result.then(
      () => {},
      () => {}
    )
    return result
  }

  private async closeCurrent(): Promise<void> {
    const server = this.server
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    this.server = undefined
    this.script = undefined
  }

  start(script: string): Promise<number> {
    return this.enqueue(async () => {
      if (this.server && this.script === script) {
        return (this.server.address() as AddressInfo).port
      }
      await this.closeCurrent()
      const server = http.createServer((request, response) => {
        if (request.method !== 'GET' || request.url?.split('?', 1)[0] !== '/pac') {
          response.writeHead(404)
          response.end()
          return
        }
        response.writeHead(200, {
          'Content-Type': 'application/x-ns-proxy-autoconfig',
          'Cache-Control': 'no-store'
        })
        response.end(script)
      })

      const port = await new Promise<number>((resolve, reject) => {
        const onError = (error: Error): void => reject(error)
        server.once('error', onError)
        server.listen(0, pacHost, () => {
          server.off('error', onError)
          resolve((server.address() as AddressInfo).port)
        })
      })
      this.server = server
      this.script = script
      return port
    })
  }

  stop(): Promise<void> {
    return this.enqueue(() => this.closeCurrent())
  }
}

export function localPacUrl(port: number): string {
  return `http://${pacHost}:${port}/pac`
}
