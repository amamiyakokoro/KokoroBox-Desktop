import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import { URL } from 'node:url'

interface PinnedHttpsAgentErrors {
  fingerprintMismatch: () => Error
  proxyConnectFailed: (statusCode: number | undefined) => Error
}

function certFingerprint(cert: tls.PeerCertificate): string {
  if (!cert.raw) return ''
  return crypto.createHash('sha256').update(cert.raw).digest('hex').toUpperCase()
}

function fingerprintError(
  socket: tls.TLSSocket,
  expectedFingerprint: string,
  createError: () => Error
): Error | undefined {
  try {
    return certFingerprint(socket.getPeerCertificate()) === expectedFingerprint
      ? undefined
      : createError()
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * Builds the HTTPS agent used for certificate-pinned downloads.
 *
 * The CONNECT tunnel deliberately waits for `secureConnect` before handing the
 * socket to the HTTPS request. A TLS failure can otherwise happen before the
 * request installs its error listener and escape as an uncaught main-process
 * exception.
 */
export function createPinnedHttpsAgent(
  targetUrl: string,
  fingerprint: string,
  proxyPort: number | undefined,
  errors: PinnedHttpsAgentErrors
): https.Agent {
  const expectedFingerprint = fingerprint.replace(/:/g, '').toUpperCase()
  const agent = new https.Agent({ rejectUnauthorized: false })

  if (!proxyPort) {
    const createConnection = agent.createConnection.bind(agent)
    agent.createConnection = (options, callback) => {
      const socket = createConnection(options, callback)
      socket?.once('secureConnect', function (this: tls.TLSSocket) {
        const error = fingerprintError(this, expectedFingerprint, errors.fingerprintMismatch)
        if (error) this.destroy(error)
      })
      return socket
    }
    return agent
  }

  const url = new URL(targetUrl)
  const hostname = url.hostname
  const port = url.port || '443'

  agent.createConnection = (_options, callback) => {
    let completed = false
    const complete = (error: Error | null, socket: tls.TLSSocket | null): void => {
      if (completed) return
      completed = true
      callback?.(error, socket!)
    }

    const request = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: `${hostname}:${port}`
    })

    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy()
        complete(errors.proxyConnectFailed(response.statusCode), null)
        return
      }

      if (head.length > 0) socket.unshift(head)
      const secureSocket = tls.connect({
        socket,
        servername: hostname,
        rejectUnauthorized: false
      })

      const onTlsError = (error: Error): void => complete(error, null)
      secureSocket.once('error', onTlsError)
      secureSocket.once('secureConnect', () => {
        const error = fingerprintError(
          secureSocket,
          expectedFingerprint,
          errors.fingerprintMismatch
        )
        if (error) {
          complete(error, null)
          secureSocket.destroy()
          return
        }

        // Keep the temporary listener until the callback has synchronously
        // attached the request's own socket listeners.
        complete(null, secureSocket)
        secureSocket.off('error', onTlsError)
      })
    })

    request.once('error', (error) => complete(error, null))
    request.end()
    return null!
  }

  return agent
}
