import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { assertSparkleArchive, sha256File, sparkleRelease } from './macos-sparkle.ts'

test('Sparkle dependency is pinned to an immutable release and SHA-256 digest', () => {
  assert.match(sparkleRelease.version, /^\d+\.\d+\.\d+$/)
  assert.match(sparkleRelease.sha256, /^[a-f0-9]{64}$/)
  assert.equal(
    sparkleRelease.url,
    `https://github.com/sparkle-project/Sparkle/releases/download/${sparkleRelease.version}/${sparkleRelease.archiveName}`
  )
  assert.doesNotMatch(sparkleRelease.url, /latest/i)
})

test('Sparkle archive verification rejects modified content', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-sparkle-test-'))
  const archive = path.join(directory, 'Sparkle.zip')
  try {
    writeFileSync(archive, 'modified archive')
    assert.equal(sha256File(archive), createHash('sha256').update('modified archive').digest('hex'))
    assert.throws(() => assertSparkleArchive(archive), /integrity check failed/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
