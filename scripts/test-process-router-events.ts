import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket from 'ws'
import { createProcessRouterEventStream } from '../src/main/service/process-router-events'

class Socket extends EventEmitter {
  readyState = WebSocket.OPEN
  pings = 0
  ping() {
    this.pings++
    this.emit('ping')
  }
  terminate() {
    this.emit('close')
  }
}
test('router stream renews only while active and stops reconnecting after shutdown', async () => {
  const socket = new Socket()
  let connects = 0
  let connected = 0
  const stream = createProcessRouterEventStream(
    () => {},
    () => {
      connected++
    },
    () => {
      connects++
      return socket as unknown as WebSocket
    },
    () => {},
    1
  )
  stream.start()
  stream.start()
  socket.emit('open')
  await delay(10)
  assert.equal(connects, 1)
  assert.equal(connected, 1)
  assert.ok(socket.pings > 0)
  stream.stop()
  const pings = socket.pings
  socket.emit('close')
  await delay(10)
  assert.equal(socket.pings, pings)
  assert.equal(connects, 1)
})
test('malformed router snapshots are rejected without publishing stale state', () => {
  const socket = new Socket()
  let updates = 0
  let errors = 0
  const stream = createProcessRouterEventStream(
    () => {
      updates++
    },
    () => {},
    () => socket as unknown as WebSocket,
    () => {
      errors++
    }
  )
  stream.start()
  socket.emit('message', Buffer.from('{"state":"running"}'))
  assert.equal(updates, 0)
  assert.equal(errors, 1)
  stream.stop()
  socket.emit('message', Buffer.from('invalid'))
  assert.equal(errors, 1)
})
