import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  resolveCoreHookDirectory,
  resolveCoreHookTouchCommand
} from '../src/main/core/coreHookPath'

test('Windows core startup hooks stay in the writable user-data directory', () => {
  assert.equal(
    resolveCoreHookDirectory('win32', 'C:\\Users\\user\\AppData\\Roaming\\KokoroBox'),
    'C:\\Users\\user\\AppData\\Roaming\\KokoroBox\\core-hooks'
  )
})

test('non-Windows core startup hooks remain under the active user-data directory', () => {
  assert.equal(
    resolveCoreHookDirectory('darwin', '/Users/user/Library/Application Support/KokoroBox'),
    '/Users/user/Library/Application Support/KokoroBox/core-hooks'
  )
})

test('Windows post-up command quotes paths containing spaces', () => {
  assert.equal(
    resolveCoreHookTouchCommand(
      'win32',
      'C:\\Users\\Example User\\AppData\\Roaming\\KokoroBox\\core-hooks\\startup.up'
    ),
    'type nul > "C:\\Users\\Example User\\AppData\\Roaming\\KokoroBox\\core-hooks\\startup.up"'
  )
})
