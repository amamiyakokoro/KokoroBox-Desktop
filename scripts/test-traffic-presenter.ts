import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('Desktop forwards Mihomo traffic and packages the executable sidecar', () => {
  const api = readFileSync('src/main/core/mihomoApi.ts', 'utf8')
  const builder = readFileSync('electron-builder.yml', 'utf8')
  const presenter = readFileSync('src/main/resolve/trafficPresenter.ts', 'utf8')

  assert.match(api, /updateTrafficPresenter\(json\)/)
  assert.match(api, /markTrafficPresenterUnavailable\(\)/)
  assert.match(builder, /win:[\s\S]*kokorobox-native-win32-\$\{arch\}-msvc/)
  assert.match(builder, /mac:[\s\S]*kokorobox-native-darwin-\$\{arch\}/)
  assert.match(builder, /linux:[\s\S]*kokorobox-native-linux-\$\{arch\}-gnu/)
  assert.match(presenter, /process\.resourcesPath, 'traffic-presenter'/)
  assert.match(presenter, /windowsHide: true/)
  assert.doesNotMatch(presenter, /detached: true/)
  assert.match(presenter, /new WeakSet<ChildProcess>/)
  assert.match(presenter, /nextChild\.once\('close'/)
})
