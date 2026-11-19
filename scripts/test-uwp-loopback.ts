import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { normalizeUwpLoopbackApp, normalizeUwpLoopbackApps } from '../src/shared/types/uwp-loopback'

test('UWP loopback IPC forwards the app ID and enabled state after the Electron event', async () => {
  const source = ts.createSourceFile(
    'ipc.ts',
    readFileSync('src/main/utils/ipc.ts', 'utf8'),
    ts.ScriptTarget.Latest
  )
  const wrapper = source.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ipcErrorWrapper'
  )
  const register = source.statements
    .filter(ts.isFunctionDeclaration)
    .find((node) => node.name?.text === 'registerIpcMainHandlers')
  const registration = register?.body?.statements.find((node) => {
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return false
    const [channel] = node.expression.arguments
    return channel && ts.isStringLiteral(channel) && channel.text === 'setUwpLoopbackExemption'
  })
  assert.ok(wrapper && registration)

  const { outputText } = ts.transpileModule(
    [wrapper.getText(source), registration.getText(source)].join('\n'),
    {}
  )
  const calls: Array<{ id: string; enabled: boolean }> = []
  type Handler = (event: object, id: string, enabled: boolean) => Promise<unknown>
  const handlers: Handler[] = []
  new Function('ipcMain', 'setUwpLoopbackExemption', outputText)(
    { handle: (_channel: string, listener: Handler) => handlers.push(listener) },
    (id: string, enabled: boolean) => calls.push({ id, enabled })
  )
  const [handler] = handlers
  assert.ok(handler)

  const id = '0123456789abcdef'
  await handler({ sender: {} }, id, true)
  await handler({ sender: {} }, id, false)
  assert.deepEqual(calls, [
    { id, enabled: true },
    { id, enabled: false }
  ])
})

test('preserves enriched native UWP package metadata', () => {
  assert.deepEqual(
    normalizeUwpLoopbackApp({
      id: 'opaque-id',
      packageFamilyName: 'Microsoft.GamingApp_8wekyb3d8bbwe',
      packageFullName: 'Microsoft.GamingApp_1.0.0.0_x64__8wekyb3d8bbwe',
      displayName: 'Xbox',
      description: 'Xbox app',
      enabled: true,
      category: 'microsoft',
      packageType: 'main',
      framework: false,
      resourcePackage: false
    }),
    {
      id: 'opaque-id',
      packageFamilyName: 'Microsoft.GamingApp_8wekyb3d8bbwe',
      packageFullName: 'Microsoft.GamingApp_1.0.0.0_x64__8wekyb3d8bbwe',
      displayName: 'Xbox',
      description: 'Xbox app',
      enabled: true,
      category: 'microsoft',
      packageType: 'main',
      framework: false,
      resourcePackage: false
    }
  )
})

test('normalizes the 0.14 native contract and hides known runtime packages', () => {
  const app = normalizeUwpLoopbackApp({
    sid: 'legacy-id',
    packageName: 'Microsoft.WindowsAppRuntime.1.4_8wekyb3d8bbwe',
    displayName: 'Windows App Runtime',
    enabled: false
  })

  assert.equal(app?.id, 'legacy-id')
  assert.equal(app?.packageFamilyName, 'Microsoft.WindowsAppRuntime.1.4_8wekyb3d8bbwe')
  assert.equal(app?.category, 'system')
})

test('does not expose unresolved manifest resource identifiers as app names', () => {
  const app = normalizeUwpLoopbackApp({
    sid: 'legacy-id',
    packageName: 'Microsoft.Windows.FilePicker_cw5n1h2txyewy',
    displayName: '@{Microsoft.Windows.FilePicker?ms-resource://AppName}',
    enabled: true
  })

  assert.equal(app?.displayName, 'Microsoft.Windows.FilePicker_cw5n1h2txyewy')
})

test('drops malformed entries instead of exposing unusable switches', () => {
  assert.deepEqual(normalizeUwpLoopbackApps([null, {}, { sid: 'missing-package' }]), [])
})
