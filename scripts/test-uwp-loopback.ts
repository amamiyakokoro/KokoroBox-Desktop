import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeUwpLoopbackApp, normalizeUwpLoopbackApps } from '../src/shared/types/uwp-loopback'

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
