import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { mergeSettingsPatch } from '../src/renderer/src/utils/merge-settings-patch.ts'

test('settings drafts merge nested objects and replace arrays without mutating the source', () => {
  const original = {
    profile: { selected: true, fakeIp: false },
    cors: { private: true, origins: ['https://example.com'] },
    port: 7890
  }

  const result = mergeSettingsPatch(original, {
    profile: { fakeIp: true },
    cors: { origins: ['*'] }
  })

  assert.deepEqual(result, {
    profile: { selected: true, fakeIp: true },
    cors: { private: true, origins: ['*'] },
    port: 7890
  })
  assert.deepEqual(original, {
    profile: { selected: true, fakeIp: false },
    cors: { private: true, origins: ['https://example.com'] },
    port: 7890
  })
})

test('Mihomo settings stage edits and restart the core once from the page', () => {
  const page = readFileSync('src/renderer/src/pages/mihomo.tsx', 'utf8')
  const stagedComponents = [
    'src/renderer/src/components/mihomo/port-setting.tsx',
    'src/renderer/src/components/mihomo/controller-setting.tsx',
    'src/renderer/src/components/mihomo/advanced-settings.tsx',
    'src/renderer/src/components/mihomo/core-log-setting.tsx'
  ]

  assert.match(page, /<FeatureSettingsSaveButton/)
  assert.match(page, /setDraftPatch/)
  assert.match(page, /await restartCore\(\)/)

  for (const file of stagedComponents) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /restartCore/)
    assert.doesNotMatch(source, /patchControledMihomoConfig/)
  }
})

test('staged settings protect unsaved changes across navigation and window lifecycle', () => {
  const guardedPages = ['syspeoxy', 'tun', 'dns', 'sniffer', 'mihomo']
  for (const page of guardedPages) {
    const source = readFileSync(`src/renderer/src/pages/${page}.tsx`, 'utf8')
    assert.match(source, /useUnsavedChangesGuard/)
    assert.match(source, /isDirty[:,]/)
    assert.match(source, /onSave[:,]/)
    assert.match(source, /onDiscard:/)
  }

  const guard = readFileSync('src/renderer/src/hooks/use-unsaved-changes.tsx', 'utf8')
  assert.match(guard, /useBlocker/)
  assert.match(guard, /useBeforeUnload/)
  assert.match(guard, /tr\('Save changes'\)/)
  assert.match(guard, /tr\('Discard changes'\)/)

  const rendererEntry = readFileSync('src/renderer/src/main.tsx', 'utf8')
  assert.match(rendererEntry, /createHashRouter/)
  assert.match(rendererEntry, /<UnsavedChangesProvider>/)
  assert.match(rendererEntry, /<RouterProvider router=\{router\}/)

  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  assert.match(app, /show-unsaved-close-confirm/)
  assert.match(app, /confirmUnsavedChanges/)

  const main = readFileSync('src/main/index.ts', 'utf8')
  assert.match(main, /rendererHasUnsavedChanges/)
  assert.match(main, /show-unsaved-close-confirm/)
})
