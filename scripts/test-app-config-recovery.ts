import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import {
  loadAppConfigFile,
  loadAppConfigFileSync,
  writeAppConfigFile
} from '../src/main/config/app-loader'

const validMain = 'language: en\nsysProxy:\n  enable: true\n'
const validBackup = 'language: zh-Hant\nsysProxy:\n  enable: false\n'

function withConfigPath(t: TestContext): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-config-recovery-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return path.join(directory, 'config.yaml')
}

async function assertBothLoaders(configPath: string, expectedLanguage?: string): Promise<void> {
  assert.equal((await loadAppConfigFile(configPath))?.language, expectedLanguage)
  assert.equal(loadAppConfigFileSync(configPath)?.language, expectedLanguage)
}

test('valid primary config takes precedence over backup', async (t) => {
  const configPath = withConfigPath(t)
  writeFileSync(configPath, validMain)
  writeFileSync(`${configPath}.backup`, validBackup)
  await assertBothLoaders(configPath, 'en')
})

test('missing, corrupt, and unreadable primary configs recover from a valid backup', async (t) => {
  const configPath = withConfigPath(t)
  writeFileSync(`${configPath}.backup`, validBackup)
  await assertBothLoaders(configPath, 'zh-Hant')

  writeFileSync(configPath, 'language: en\nsysProxy: [invalid]\n')
  await assertBothLoaders(configPath, 'zh-Hant')

  rmSync(configPath)
  mkdirSync(configPath)
  await assertBothLoaders(configPath, 'zh-Hant')
})

test('both invalid candidates leave selection to the default config', async (t) => {
  const configPath = withConfigPath(t)
  writeFileSync(configPath, 'sysProxy: null\n')
  writeFileSync(`${configPath}.backup`, 'sysProxy: [invalid]\n')
  await assertBothLoaders(configPath)
})

test('writing after backup recovery preserves the valid backup', async (t) => {
  const configPath = withConfigPath(t)
  writeFileSync(configPath, 'sysProxy: [damaged]\n')
  writeFileSync(`${configPath}.backup`, validBackup)

  await writeAppConfigFile(configPath, validMain, 'win32')

  assert.equal(readFileSync(`${configPath}.backup`, 'utf8'), validBackup)
  await assertBothLoaders(configPath, 'en')
})
