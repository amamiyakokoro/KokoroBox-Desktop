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
  const page = readFileSync(
    'src/renderer/src/components/settings/network/mihomo-settings.tsx',
    'utf8'
  )
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
  const guardedPages = [
    'src/renderer/src/components/settings/network/system-proxy-settings.tsx',
    'src/renderer/src/components/settings/network/tun-settings.tsx',
    'src/renderer/src/components/settings/network/dns-settings.tsx',
    'src/renderer/src/pages/sniffer.tsx',
    'src/renderer/src/components/settings/network/mihomo-settings.tsx'
  ]
  for (const page of guardedPages) {
    const source = readFileSync(page, 'utf8')
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

test('application settings keep navigation discoverable in compact desktop windows', () => {
  const settings = readFileSync('src/renderer/src/pages/settings.tsx', 'utf8')

  assert.match(settings, /compactNavigationQuery = '\(max-width: 1050px\)'/)
  assert.match(settings, /isDisabled=\{!compactNavigation\}/)
  assert.match(settings, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(settings, /event\.key\.toLowerCase\(\) === 'f'/)
  assert.match(settings, /settings-content-header sticky top-0/)
  assert.match(settings, /scrollTo\(\{ top: 0 \}\)/)
})

test('network settings use nested panels and preserve legacy routes', () => {
  const registry = readFileSync(
    'src/renderer/src/components/settings/settings-registry.tsx',
    'utf8'
  )
  const settings = readFileSync('src/renderer/src/pages/settings.tsx', 'utf8')
  const routes = readFileSync('src/renderer/src/routes/index.tsx', 'utf8')
  const sider = readFileSync('src/renderer/src/components/sider/sider-cards.tsx', 'utf8')

  assert.match(registry, /key: 'network'/)
  assert.match(registry, /key: 'system-proxy'/)
  assert.match(registry, /content: \(\) => <Sysproxy embedded \/>/)
  assert.match(registry, /key: 'tun'/)
  assert.match(registry, /content: \(\) => <Tun embedded \/>/)
  assert.match(registry, /key: 'dns'/)
  assert.match(registry, /content: \(\) => <DNS embedded \/>/)
  assert.match(registry, /key: 'mihomo'/)
  assert.match(registry, /content: \(\) => <Mihomo embedded \/>/)
  assert.match(settings, /selected\.panels/)
  assert.match(settings, /selectedPanel\?\.content\(\)/)
  assert.match(routes, /settings\?section=network&panel=system-proxy/)
  assert.match(routes, /settings\?section=network&panel=tun/)
  assert.match(routes, /settings\?section=network&panel=dns/)
  assert.match(routes, /settings\?section=network&panel=mihomo/)
  assert.match(sider, /settings\?section=network&panel=system-proxy/)
  assert.match(sider, /settings\?section=network&panel=tun/)
  assert.match(sider, /settings\?section=network&panel=dns/)
  assert.match(sider, /settings\?section=network&panel=mihomo/)
})
