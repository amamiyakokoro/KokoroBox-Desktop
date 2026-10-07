import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  writeDurableText,
  writeProfileKeyTransaction,
  recoverProfileKeyTransaction,
  readProfileKeySnapshot
} from '../src/main/config/profile-key-transaction'

const oldConfig = 'items:\n - id: p\n   ageIdentity: old\n'
const nextConfig = 'items:\n - id: p\n   ageIdentity: new\n'
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), 'kokoro-key-transaction-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'profiles'))
  await writeFile(join(directory, 'profile.yaml'), oldConfig)
  await writeFile(join(directory, 'profiles/p.yaml'), 'old ciphertext')
  return directory
}

test('key updates commit both files privately and remove their rollback record', async (t) => {
  const dir = await fixture(t)
  await writeProfileKeyTransaction(
    dir,
    'p',
    oldConfig,
    'old ciphertext',
    nextConfig,
    'new ciphertext'
  )
  assert.equal(await readFile(join(dir, 'profile.yaml'), 'utf8'), nextConfig)
  assert.equal(await readFile(join(dir, 'profiles/p.yaml'), 'utf8'), 'new ciphertext')
  await assert.rejects(stat(join(dir, '.profile-key-update.json')), { code: 'ENOENT' })
  if (process.platform !== 'win32')
    assert.equal((await stat(join(dir, 'profiles/p.yaml'))).mode & 0o777, 0o600)
})

test('failures before content or metadata writes restore the original pair', async (t) => {
  for (const failedContent of ['new ciphertext', nextConfig]) {
    const dir = await fixture(t)
    await assert.rejects(
      writeProfileKeyTransaction(
        dir,
        'p',
        oldConfig,
        'old ciphertext',
        nextConfig,
        'new ciphertext',
        async (path, content) => {
          if (content === failedContent) throw new Error('disk full')
          await writeDurableText(path, content)
        }
      ),
      /disk full/
    )
    assert.equal(await readFile(join(dir, 'profile.yaml'), 'utf8'), oldConfig)
    assert.equal(await readFile(join(dir, 'profiles/p.yaml'), 'utf8'), 'old ciphertext')
  }
})

test('failed rollback retains a recovery record and the next recovery restores it', async (t) => {
  const dir = await fixture(t)
  await assert.rejects(
    writeProfileKeyTransaction(
      dir,
      'p',
      oldConfig,
      'old ciphertext',
      nextConfig,
      'new ciphertext',
      async (path, content) => {
        if (content !== 'new ciphertext') throw new Error('temporary I/O failure')
        await writeDurableText(path, content)
      }
    ),
    /recovery is required/
  )
  assert.equal(await readFile(join(dir, 'profiles/p.yaml'), 'utf8'), 'new ciphertext')
  await recoverProfileKeyTransaction(dir)
  assert.deepEqual(await readProfileKeySnapshot(dir, 'p'), {
    item: { id: 'p', ageIdentity: 'old' },
    content: 'old ciphertext'
  })
})

test('startup recovery rolls back interrupted updates at every partial commit point', async (t) => {
  for (const completedMetadata of [false, true]) {
    const dir = await fixture(t)
    await writeDurableText(
      join(dir, '.profile-key-update.json'),
      JSON.stringify({ version: 1, id: 'p', config: oldConfig, content: 'old ciphertext' })
    )
    await writeFile(join(dir, 'profiles/p.yaml'), 'new ciphertext')
    if (completedMetadata) await writeFile(join(dir, 'profile.yaml'), nextConfig)
    await recoverProfileKeyTransaction(dir)
    assert.equal(await readFile(join(dir, 'profile.yaml'), 'utf8'), oldConfig)
    assert.equal(await readFile(join(dir, 'profiles/p.yaml'), 'utf8'), 'old ciphertext')
  }
})

test('readers wait for key transactions and cannot observe a mixed key/content pair', async (t) => {
  const dir = await fixture(t)
  let release!: () => void
  let started!: () => void
  const entered = new Promise<void>((resolve) => {
    started = resolve
  })
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const update = writeProfileKeyTransaction(
    dir,
    'p',
    oldConfig,
    'old ciphertext',
    nextConfig,
    'new ciphertext',
    async (path, content) => {
      if (content === nextConfig) {
        started()
        await wait
      }
      await writeDurableText(path, content)
    }
  )
  await entered
  let resolved = false
  const snapshot = readProfileKeySnapshot(dir, 'p').then((value) => {
    resolved = true
    return value
  })
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(resolved, false)
  release()
  await update
  assert.deepEqual(await snapshot, {
    item: { id: 'p', ageIdentity: 'new' },
    content: 'new ciphertext'
  })
})

test('malformed recovery records cannot write outside managed profiles', async (t) => {
  const dir = await fixture(t)
  await writeFile(
    join(dir, '.profile-key-update.json'),
    JSON.stringify({ version: 1, id: '../config', config: oldConfig, content: 'bad' })
  )
  await assert.rejects(recoverProfileKeyTransaction(dir), /Invalid managed configuration ID/)
  assert.equal(await readFile(join(dir, 'profile.yaml'), 'utf8'), oldConfig)
})
