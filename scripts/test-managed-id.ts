import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { assertManagedConfig, assertManagedId } from '../src/shared/managed-id'
import { validateBackupArchive } from '../src/main/resolve/backup-archive'
import AdmZip from 'adm-zip'

test('managed IDs reject traversal, absolute paths, controls, device names and duplicate IDs', () => {
  for (const id of [
    '../config',
    '/tmp/file',
    '..',
    'x/y',
    'x\\y',
    'a\0',
    'CON',
    'nul.yaml',
    'x.',
    '',
    'a'.repeat(129),
    null
  ]) {
    assert.throws(() => assertManagedId(id))
  }
  for (const id of ['default', 'work', '19a12f', 'legacy.id', 'uuid-with-dashes'])
    assertManagedId(id)
  assert.throws(() => assertManagedConfig({ items: [{ id: 'x' }, { id: 'x' }] }, 'profile'))
  assert.throws(() => assertManagedConfig({ items: [], current: '../config' }, 'profile'))
  assert.throws(() =>
    assertManagedConfig({ items: [{ id: 'x', override: ['../secret'] }] }, 'profile')
  )
  assert.throws(() => assertManagedConfig({ items: [{ id: 'x', ext: '../../file' }] }, 'override'))
})

test('backup validation rejects traversal IDs and malformed references before restore', () => {
  for (const [file, content] of [
    ['profile.yaml', 'items:\n - id: ../config\n'],
    ['profile.yaml', 'items: []\ncurrent: ../config\n'],
    ['override.yaml', 'items:\n - id: ../config\n   ext: yaml\n']
  ]) {
    const zip = new AdmZip()
    for (const [name, data] of Object.entries({
      'config.yaml': 'sysProxy: {}',
      'mihomo.yaml': 'mixed-port: 7890',
      'profile.yaml': 'items: []',
      'override.yaml': 'items: []',
      [file]: content
    }))
      zip.addFile(name, Buffer.from(data))
    assert.throws(() => validateBackupArchive(zip.toBuffer()), /Invalid managed configuration ID/)
  }
})

test('production path builders reject unsafe IDs and extensions at the filesystem boundary', () => {
  const source = ts.createSourceFile(
    'dirs.ts',
    readFileSync('src/main/utils/dirs.ts', 'utf8'),
    ts.ScriptTarget.ES2022,
    true
  )
  const names = ['profilePath', 'overridePath', 'mihomoProfileWorkDir']
  const code = source.statements
    .filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text || ''))
    .map((node) => node.getText(source))
    .join('\n')
  const compiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText
  const builders = new Function(
    'assertManagedId',
    'path',
    'profilesDir',
    'overrideDir',
    'mihomoWorkDir',
    `const exports={}; ${compiled}; return exports;`
  )(
    assertManagedId,
    path,
    () => '/data/profiles',
    () => '/data/override',
    () => '/data/work'
  )
  for (const build of [builders.profilePath, builders.mihomoProfileWorkDir])
    assert.throws(() => build('../config'))
  assert.throws(() => builders.overridePath('safe', '../yaml'))
  assert.equal(builders.profilePath('safe'), '/data/profiles/safe.yaml')
})
