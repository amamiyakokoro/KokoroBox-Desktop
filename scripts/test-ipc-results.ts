import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

test('renderer IPC preserves nullable results and still surfaces invocation errors', () => {
  const source = ts.createSourceFile(
    'ipc.ts',
    readFileSync('src/renderer/src/utils/ipc.ts', 'utf8'),
    ts.ScriptTarget.ES2022,
    true
  )
  const node = source.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ipcErrorWrapper'
  )!
  const compiled = ts.transpileModule(node.getText(source), {}).outputText
  const wrap = new Function(`${compiled}; return ipcErrorWrapper;`)()
  for (const value of [null, undefined, false, 0, '', [], { enabled: null }])
    assert.equal(wrap(value), value)
  const failure = new Error('failed')
  assert.throws(
    () => wrap({ invokeError: failure }),
    (error) => error === failure
  )
})
