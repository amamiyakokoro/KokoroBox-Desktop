import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { productIdentity } from '../src/shared/product-identity'
import { migrateUserDataDirectory } from '../src/main/utils/userDataMigration'

function createAppDataDirectory(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'kokorobox-user-data-migration-'))
}

test('moves a legacy Sparkle user-data directory atomically to KokoroBox', () => {
  const appDataPath = createAppDataDirectory()
  try {
    const legacyPath = path.join(appDataPath, productIdentity.legacyUserDataDirectories[0])
    mkdirSync(legacyPath)
    writeFileSync(path.join(legacyPath, 'config.yaml'), 'language: zh-Hant\n')

    const result = migrateUserDataDirectory(appDataPath)
    const targetPath = path.join(appDataPath, productIdentity.userDataDirectory)

    assert.deepEqual(result, { status: 'migrated', userDataPath: targetPath })
    assert.equal(existsSync(legacyPath), false)
    assert.equal(readFileSync(path.join(targetPath, 'config.yaml'), 'utf8'), 'language: zh-Hant\n')
  } finally {
    rmSync(appDataPath, { recursive: true, force: true })
  }
})

test('does not merge or overwrite when both legacy and KokoroBox directories exist', () => {
  const appDataPath = createAppDataDirectory()
  try {
    const legacyPath = path.join(appDataPath, productIdentity.legacyUserDataDirectories[0])
    const targetPath = path.join(appDataPath, productIdentity.userDataDirectory)
    mkdirSync(legacyPath)
    mkdirSync(targetPath)
    writeFileSync(path.join(legacyPath, 'config.yaml'), 'legacy: true\n')
    writeFileSync(path.join(targetPath, 'config.yaml'), 'current: true\n')

    assert.deepEqual(migrateUserDataDirectory(appDataPath), {
      status: 'conflict',
      userDataPath: legacyPath,
      legacyPath
    })
    assert.equal(readFileSync(path.join(legacyPath, 'config.yaml'), 'utf8'), 'legacy: true\n')
    assert.equal(readFileSync(path.join(targetPath, 'config.yaml'), 'utf8'), 'current: true\n')
  } finally {
    rmSync(appDataPath, { recursive: true, force: true })
  }
})

test('uses the KokoroBox directory for clean and previously migrated installs', () => {
  const appDataPath = createAppDataDirectory()
  try {
    const targetPath = path.join(appDataPath, productIdentity.userDataDirectory)
    assert.deepEqual(migrateUserDataDirectory(appDataPath), {
      status: 'not-needed',
      userDataPath: targetPath
    })

    mkdirSync(targetPath)
    assert.deepEqual(migrateUserDataDirectory(appDataPath), {
      status: 'already-migrated',
      userDataPath: targetPath
    })
  } finally {
    rmSync(appDataPath, { recursive: true, force: true })
  }
})
