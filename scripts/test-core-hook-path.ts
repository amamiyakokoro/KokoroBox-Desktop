import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveCoreHookDirectory } from '../src/main/core/coreHookPath'

test('Windows core startup hooks use the KokoroBox ProgramData namespace', () => {
  assert.equal(
    resolveCoreHookDirectory('win32', 'C:\\ProgramData', 'C:\\Users\\user\\AppData\\Roaming\\KokoroBox'),
    'C:\\ProgramData\\KokoroBox\\core-hooks'
  )
})

test('non-Windows core startup hooks remain under the active user-data directory', () => {
  assert.equal(
    resolveCoreHookDirectory('darwin', undefined, '/Users/user/Library/Application Support/KokoroBox'),
    '/Users/user/Library/Application Support/KokoroBox/core-hooks'
  )
})
