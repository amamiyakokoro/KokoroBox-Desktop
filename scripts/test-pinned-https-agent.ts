import assert from 'node:assert/strict'
import http from 'node:http'
import https from 'node:https'
import { test } from 'node:test'
import { createPinnedHttpsAgent } from '../src/main/utils/pinnedHttpsAgent'

test('a TLS disconnect inside an HTTP CONNECT tunnel rejects the request', async () => {
  const proxy = http.createServer()
  proxy.on('connect', (_request, socket) => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    setImmediate(() => socket.destroy())
  })

  await new Promise<void>((resolve) => {
    proxy.listen(0, '127.0.0.1', resolve)
  })
  const address = proxy.address()
  assert.ok(address && typeof address !== 'string')

  try {
    const agent = createPinnedHttpsAgent(
      'https://example.invalid/profile.yaml',
      '00'.repeat(32),
      address.port,
      {
        fingerprintMismatch: () => new Error('fingerprint mismatch'),
        proxyConnectFailed: (statusCode) => new Error(`proxy failed: ${statusCode}`)
      }
    )

    const error = await new Promise<Error>((resolve, reject) => {
      const request = https.get('https://example.invalid/profile.yaml', { agent })
      request.setTimeout(3000, () => request.destroy(new Error('request timed out')))
      request.once('response', () => reject(new Error('request unexpectedly succeeded')))
      request.once('error', resolve)
    })

    assert.match(error.message, /socket|TLS|connection|reset|closed/i)
  } finally {
    await new Promise<void>((resolve, reject) => {
      proxy.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
})
