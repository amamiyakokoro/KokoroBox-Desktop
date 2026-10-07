import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function fixture() {
  const source = ts.createSourceFile(
    'deepLink.ts',
    readFileSync('src/main/resolve/deepLink.ts', 'utf8'),
    ts.ScriptTarget.ES2022,
    true
  )
  const fn = source.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'showImportConfirmation'
  )!
  const code = ts.transpileModule(fn.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  const ipcMain = new EventEmitter()
  const window = new EventEmitter() as EventEmitter & {
    isDestroyed: () => boolean
    webContents: object
  }
  const shown: { channel: string; requestId: string; url: string }[] = []
  window.isDestroyed = () => false
  window.webContents = {
    send: (channel: string, payload: { requestId: string; url: string }) =>
      shown.push({ channel, ...payload })
  }
  const ask = new Function(
    'confirmationQueue',
    'ipcMain',
    'randomUUID',
    `${code}; return showImportConfirmation;`
  )(Promise.resolve(), ipcMain, randomUUID) as (
    kind: string,
    url: string,
    name: string,
    context: object
  ) => Promise<boolean>
  const context = { getMainWindow: () => window, createWindow: async () => {}, showWindow: () => 0 }
  return {
    ask: (kind: string, name: string) => ask(kind, `https://example.test/${name}`, name, context),
    ipcMain,
    window,
    shown
  }
}
async function shownAfterTick() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 10)
  })
}

test('import confirmations queue across kinds and ignore wrong request IDs and senders', async () => {
  const f = fixture()
  const first = f.ask('override', 'first.js')
  const second = f.ask('profile', 'second.yaml')
  await shownAfterTick()
  assert.equal(f.shown.length, 1)
  const id = f.shown[0].requestId
  f.ipcMain.emit(
    'override-install-confirm-result',
    { sender: f.window.webContents },
    { requestId: 'other', confirmed: true }
  )
  f.ipcMain.emit(
    'override-install-confirm-result',
    { sender: {} },
    { requestId: id, confirmed: true }
  )
  assert.equal(f.ipcMain.listenerCount('override-install-confirm-result'), 1)
  f.ipcMain.emit(
    'override-install-confirm-result',
    { sender: f.window.webContents },
    { requestId: id, confirmed: true }
  )
  assert.equal(await first, true)
  await shownAfterTick()
  assert.equal(f.shown.length, 2)
  assert.notEqual(f.shown[1].requestId, id)
  f.ipcMain.emit(
    'profile-install-confirm-result',
    { sender: f.window.webContents },
    { requestId: f.shown[1].requestId, confirmed: false }
  )
  assert.equal(await second, false)
  assert.equal(f.ipcMain.eventNames().length, 0)
})

test('closing the confirmation window cancels the request and releases queued imports', async () => {
  const f = fixture()
  const first = f.ask('profile', 'first.yaml')
  await shownAfterTick()
  f.window.emit('closed')
  assert.equal(await first, false)
  assert.equal(f.ipcMain.eventNames().length, 0)
  const next = f.ask('profile', 'next.yaml')
  await shownAfterTick()
  f.ipcMain.emit(
    'profile-install-confirm-result',
    { sender: f.window.webContents },
    { requestId: f.shown.at(-1)!.requestId, confirmed: true }
  )
  assert.equal(await next, true)
})
