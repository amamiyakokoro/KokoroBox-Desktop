import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createConnection, createServer, type Server, type Socket } from 'node:net'
import path from 'node:path'
import { parseKokoroCallback } from '../kokoro/oauth'

const RELAY_FILENAME = 'kokoro-callback-relay.json'
const RELAY_CONTEXT = 'kokorobox-oauth-callback-relay:'
const MAX_MESSAGE_BYTES = 12 * 1024
const RELAY_TIMEOUT_MS = 3000

interface RelayEndpoint {
  id: string
  port: number
}

export interface KokoroCallbackRelay {
  close: () => Promise<void>
}

export function kokoroCallbackRelayPath(userData: string): string {
  return path.join(userData, RELAY_FILENAME)
}

export function createKokoroRelayProof(state: string, nonce: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce)) throw new Error('Invalid relay nonce')
  return createHmac('sha256', state)
    .update(RELAY_CONTEXT + nonce, 'ascii')
    .digest('base64url')
}

function verifyKokoroRelayProof(state: string, nonce: string, proof: unknown): boolean {
  if (typeof proof !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(proof)) return false
  const expected = Buffer.from(createKokoroRelayProof(state, nonce), 'ascii')
  const actual = Buffer.from(proof, 'ascii')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function writeLine(socket: Socket, value: object): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(`${JSON.stringify(value)}\n`, (error) => (error ? reject(error) : resolve()))
  })
}

function readLine(socket: Socket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const finish = (error?: Error, value?: Record<string, unknown>): void => {
      clearTimeout(timer)
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('close', onClose)
      if (error) reject(error)
      else resolve(value!)
    }
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8')
      if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
        finish(new Error('Relay message is too large'))
        return
      }
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      try {
        const value = JSON.parse(buffer.slice(0, newline))
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error('Invalid relay message')
        finish(undefined, value)
      } catch {
        finish(new Error('Invalid relay message'))
      }
    }
    const onError = (): void => finish(new Error('Relay connection failed'))
    const onClose = (): void => finish(new Error('Relay connection closed'))
    const timer = setTimeout(
      () => finish(new Error('Relay connection timed out')),
      RELAY_TIMEOUT_MS
    )
    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('close', onClose)
  })
}

function connect(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Relay connection timed out'))
    }, RELAY_TIMEOUT_MS)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.off('error', onError)
      resolve(socket)
    })
    const onError = (): void => {
      clearTimeout(timer)
      reject(new Error('Relay connection failed'))
    }
    socket.once('error', onError)
  })
}

async function handleConnection(
  socket: Socket,
  proofForNonce: (nonce: string) => string | null,
  receive: (callback: string) => void
): Promise<void> {
  socket.setNoDelay(true)
  try {
    const hello = await readLine(socket)
    const nonce = typeof hello.nonce === 'string' ? hello.nonce : ''
    const proof = proofForNonce(nonce)
    if (!proof) throw new Error('No pending login')
    await writeLine(socket, { proof })
    const message = await readLine(socket)
    if (typeof message.callback !== 'string') throw new Error('Missing callback')
    parseKokoroCallback(message.callback)
    receive(message.callback)
    await writeLine(socket, { received: true })
  } catch {
    // Callback URLs and authentication failures must never enter logs.
  } finally {
    socket.destroy()
  }
}

export async function startKokoroCallbackRelay(
  endpointPath: string,
  proofForNonce: (nonce: string) => string | null,
  receive: (callback: string) => void
): Promise<KokoroCallbackRelay> {
  await mkdir(path.dirname(endpointPath), { recursive: true })
  const server: Server = createServer((socket) => {
    void handleConnection(socket, proofForNonce, receive)
  })
  server.maxConnections = 8
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  // Avoid turning a later listener error into an uncaught process exception.
  server.on('error', () => {})
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Relay did not bind to TCP')
  }
  const endpoint: RelayEndpoint = { id: randomBytes(16).toString('base64url'), port: address.port }
  const temporaryPath = `${endpointPath}.${endpoint.id}.tmp`
  try {
    await writeFile(temporaryPath, JSON.stringify(endpoint), { mode: 0o600 })
    await rm(endpointPath, { force: true })
    await rename(temporaryPath, endpointPath)
  } catch (error) {
    server.close()
    await rm(temporaryPath, { force: true })
    throw error
  }

  return {
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
      try {
        const current = JSON.parse(await readFile(endpointPath, 'utf8')) as RelayEndpoint
        if (current.id === endpoint.id) await rm(endpointPath, { force: true })
      } catch {
        // A missing or replaced endpoint belongs to no longer-running relay state.
      }
    }
  }
}

export async function forwardKokoroCallback(
  endpointPath: string,
  callback: string
): Promise<boolean> {
  let socket: Socket | undefined
  try {
    const parsedCallback = parseKokoroCallback(callback)
    const state = parsedCallback.searchParams.get('state')
    if (!state) return false
    const endpoint = JSON.parse(await readFile(endpointPath, 'utf8')) as RelayEndpoint
    if (
      !endpoint ||
      typeof endpoint.id !== 'string' ||
      !/^[A-Za-z0-9_-]{22}$/.test(endpoint.id) ||
      !Number.isInteger(endpoint.port) ||
      endpoint.port < 1 ||
      endpoint.port > 65535
    )
      return false
    socket = await connect(endpoint.port)
    const nonce = randomBytes(32).toString('base64url')
    await writeLine(socket, { nonce })
    const challenge = await readLine(socket)
    if (!verifyKokoroRelayProof(state, nonce, challenge.proof)) return false
    await writeLine(socket, { callback })
    const acknowledgement = await readLine(socket)
    return acknowledgement.received === true
  } catch {
    return false
  } finally {
    socket?.destroy()
  }
}
