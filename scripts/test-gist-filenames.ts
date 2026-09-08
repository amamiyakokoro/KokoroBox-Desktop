import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildGistRawUrl, resolveGistFileNames } from '../src/shared/gist-filenames'

test('new runtime-sync Gists use KokoroBox filenames', () => {
  assert.deepEqual(resolveGistFileNames(undefined, false), {
    fileName: 'kokorobox.yaml',
    staleFileName: 'kokorobox.yaml.age'
  })
  assert.deepEqual(resolveGistFileNames(undefined, true), {
    fileName: 'kokorobox.yaml.age',
    staleFileName: 'kokorobox.yaml'
  })
})

test('existing Sparkle Gists retain their public filename during sync', () => {
  assert.deepEqual(resolveGistFileNames({ 'sparkle.yaml': {} }, false), {
    fileName: 'sparkle.yaml',
    staleFileName: 'sparkle.yaml.age'
  })
  assert.deepEqual(resolveGistFileNames({ 'sparkle.yaml': {} }, true), {
    fileName: 'sparkle.yaml.age',
    staleFileName: 'sparkle.yaml'
  })
  assert.equal(
    buildGistRawUrl('https://gist.github.com/example', { 'sparkle.yaml': {} }, false),
    'https://gist.github.com/example/raw/sparkle.yaml'
  )
})

test('KokoroBox filenames win if a Gist contains both migration generations', () => {
  assert.deepEqual(
    resolveGistFileNames({ 'sparkle.yaml': {}, 'kokorobox.yaml.age': {} }, false),
    { fileName: 'kokorobox.yaml', staleFileName: 'kokorobox.yaml.age' }
  )
})
