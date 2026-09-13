import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  encodeTrafficPresenterCommand,
  trafficPresenterLayout,
  trafficPresenterProtocolVersion
} from '../src/shared/traffic-presenter'

test('traffic presenter commands use the versioned JSON-lines protocol', () => {
  assert.equal(
    encodeTrafficPresenterCommand({
      version: trafficPresenterProtocolVersion,
      type: 'traffic',
      up: 1024,
      down: 2048
    }),
    '{"version":1,"type":"traffic","up":1024,"down":2048}\n'
  )
  assert.equal(
    encodeTrafficPresenterCommand({
      version: trafficPresenterProtocolVersion,
      type: 'unavailable'
    }),
    '{"version":1,"type":"unavailable"}\n'
  )
})

test('taskbar uses a stacked layout and status areas use a horizontal layout', () => {
  assert.equal(trafficPresenterLayout('win32'), 'stacked')
  assert.equal(trafficPresenterLayout('darwin'), 'horizontal')
  assert.equal(trafficPresenterLayout('linux'), 'horizontal')
})
