import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

const rendererRoot = 'src/renderer/src'
const compatibilityCssPath = 'src/renderer/src/assets/main-compatible.css'

const legacyV2ImportFiles = new Set([
  'src/renderer/src/components/profiles/kokoro-default-rules.tsx',
  'src/renderer/src/components/profiles/kokoro-subscription-modal.tsx',
  'src/renderer/src/components/resources/geo-data.tsx',
  'src/renderer/src/floating.tsx',
  'src/renderer/src/main.tsx',
  'src/renderer/src/pages/connections.tsx',
  'src/renderer/src/pages/override.tsx',
  'src/renderer/src/pages/profiles.tsx',
  'src/renderer/src/pages/settings.tsx',
  'src/renderer/src/traymenu.tsx'
])

const legacyV2StyleEntries = new Set([
  'src/renderer/src/assets/floating.css',
  'src/renderer/src/assets/main.css',
  'src/renderer/src/assets/traymenu.css'
])

const allowedKokoExports = new Set([
  'KokoActionMenu',
  'KokoButton',
  'KokoSelect',
  'KokoSwitch',
  'KokoTabs',
  'KokoTextField',
  'KokoTooltip'
])

const allowedInternalClasses = new Set([
  '.button',
  '.button--icon-only',
  '.button--sm',
  '.close-button',
  '.input',
  '.input-group',
  '.input-group__input',
  '.input-group__suffix',
  '.list-box',
  '.list-box-item',
  '.list-box-item__indicator',
  '.modal__body',
  '.select',
  '.select__popover',
  '.select__trigger',
  '.select__value',
  '.slider',
  '.slider__fill',
  '.slider__thumb',
  '.slider__track',
  '.switch',
  '.switch--lg',
  '.switch--sm',
  '.switch__control',
  '.switch__thumb',
  '.tabs',
  '.tabs__indicator',
  '.tabs__list',
  '.tabs__list-container',
  '.tabs__tab',
  '.toast',
  '.toast__content',
  '.toast__description',
  '.toast__title'
])

const allowedRadiusTokens = new Set([
  'field-radius',
  'radius',
  'radius-2xl',
  'radius-3xl',
  'radius-4xl',
  'radius-lg',
  'radius-md',
  'radius-xl'
])

const temporaryKokoShimConsumers = {
  KokoButton: new Set([
    'src/renderer/src/components/app-routing/group-name-modal.tsx',
    'src/renderer/src/components/base/base-list-editor.tsx',
    'src/renderer/src/components/connections/connection-item.tsx',
    'src/renderer/src/components/dns/dns-server-list.tsx',
    'src/renderer/src/components/mihomo/advanced-settings.tsx',
    'src/renderer/src/components/mihomo/controller-setting.tsx',
    'src/renderer/src/components/mihomo/env-setting.tsx',
    'src/renderer/src/components/mihomo/interface-modal.tsx',
    'src/renderer/src/components/mihomo/log-setting.tsx',
    'src/renderer/src/components/mihomo/macos-service-setup.tsx',
    'src/renderer/src/components/mihomo/permission-modal.tsx',
    'src/renderer/src/components/mihomo/port-setting.tsx',
    'src/renderer/src/components/mihomo/service-modal.tsx',
    'src/renderer/src/components/profiles/profile-item.tsx',
    'src/renderer/src/components/resources/proxy-provider.tsx',
    'src/renderer/src/components/settings/actions.tsx',
    'src/renderer/src/components/settings/appearance-confis.tsx',
    'src/renderer/src/components/settings/behavior-settings.tsx',
    'src/renderer/src/components/settings/core-runtime-config.tsx',
    'src/renderer/src/components/settings/general-config.tsx',
    'src/renderer/src/components/settings/network/system-proxy-settings.tsx',
    'src/renderer/src/components/settings/network/tun-settings.tsx',
    'src/renderer/src/components/settings/shortcut-config.tsx',
    'src/renderer/src/components/settings/sider-config.tsx',
    'src/renderer/src/components/settings/subscription-integration-settings.tsx',
    'src/renderer/src/components/settings/webdav-config.tsx',
    'src/renderer/src/pages/logs.tsx'
  ]),
  KokoSwitch: new Set([
    'src/renderer/src/components/dns/advanced-dns-setting.tsx',
    'src/renderer/src/components/mihomo/advanced-settings.tsx',
    'src/renderer/src/components/mihomo/controller-setting.tsx',
    'src/renderer/src/components/mihomo/env-setting.tsx',
    'src/renderer/src/components/mihomo/log-setting.tsx',
    'src/renderer/src/components/mihomo/port-setting.tsx',
    'src/renderer/src/components/settings/appearance-confis.tsx',
    'src/renderer/src/components/settings/behavior-settings.tsx',
    'src/renderer/src/components/settings/general-config.tsx',
    'src/renderer/src/components/settings/network/dns-settings.tsx',
    'src/renderer/src/components/settings/network/mihomo-settings.tsx',
    'src/renderer/src/components/settings/network/sniffer-settings.tsx',
    'src/renderer/src/components/settings/network/system-proxy-settings.tsx',
    'src/renderer/src/components/settings/network/tun-settings.tsx',
    'src/renderer/src/components/settings/sider-config.tsx',
    'src/renderer/src/components/settings/subscription-integration-settings.tsx'
  ]),
  KokoTooltip: new Set([
    'src/renderer/src/components/dns/advanced-dns-setting.tsx',
    'src/renderer/src/components/dns/dns-server-list.tsx',
    'src/renderer/src/components/mihomo/advanced-settings.tsx',
    'src/renderer/src/components/mihomo/controller-setting.tsx',
    'src/renderer/src/components/mihomo/log-setting.tsx',
    'src/renderer/src/components/profiles/profile-item.tsx',
    'src/renderer/src/components/settings/actions.tsx',
    'src/renderer/src/components/settings/appearance-confis.tsx',
    'src/renderer/src/components/settings/behavior-settings.tsx',
    'src/renderer/src/components/settings/general-config.tsx',
    'src/renderer/src/components/settings/network/dns-settings.tsx',
    'src/renderer/src/components/settings/network/system-proxy-settings.tsx',
    'src/renderer/src/components/settings/sider-config.tsx',
    'src/renderer/src/components/settings/subscription-integration-settings.tsx',
    'src/renderer/src/pages/logs.tsx'
  ])
}

const internalClassPattern =
  /\.(?:button|close-button|switch|tabs|select|list-box(?:-item)?|input(?:-group)?|modal|drawer|tooltip|card|toast|slider|meter|progress-bar)(?:(?:__|--)[\w-]+)?(?=[\s.:#>+~,\u005b]|$)/g

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(path) : [path]
  })
}

function collectSourceFiles(directory: string): string[] {
  return collectFiles(directory).filter((file) => /\.[cm]?[jt]sx?$/.test(file))
}

function extractSelectors(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors: string[] = []

  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const block = match[1].trim()
    if (block.startsWith('@') || /^(?:from|to|\d+%)/.test(block)) continue
    selectors.push(...block.split(',').map((selector) => selector.replace(/\s+/g, ' ').trim()))
  }

  return selectors
}

test('HeroUI v2 renderer imports are a shrinking allowlist', () => {
  const actualFiles = collectSourceFiles(rendererRoot)
    // hero.mjs is the legacy Tailwind plugin entry and has its own bounded test below.
    .filter((file) => relative('.', file) !== 'src/renderer/src/assets/hero.mjs')
    .filter((file) => /['"]@heroui\/react['"]/.test(readFileSync(file, 'utf8')))
    .map((file) => relative('.', file))
    .sort()

  for (const file of actualFiles) {
    assert.ok(legacyV2ImportFiles.has(file), `new HeroUI v2 import added in ${file}`)
  }
  assert.ok(actualFiles.length <= legacyV2ImportFiles.size)
})

test('the HeroUI v2 Tailwind plugin is not loaded by new style entries', () => {
  const styleFiles = collectFiles('src/renderer/src/assets')
    .filter((file) => file.endsWith('.css'))
    .filter((file) => /@plugin\s+['"][^'"]*hero\.mjs['"]/.test(readFileSync(file, 'utf8')))
    .map((file) => relative('.', file))
    .sort()

  for (const file of styleFiles) {
    assert.ok(legacyV2StyleEntries.has(file), `new HeroUI v2 style entry added in ${file}`)
  }
  assert.ok(styleFiles.length <= legacyV2StyleEntries.size)
})

test('HeroUI internal compatibility selectors can shrink but cannot expand', () => {
  const css = readFileSync(compatibilityCssPath, 'utf8')
  const internalSelectors = extractSelectors(css).filter((selector) => {
    internalClassPattern.lastIndex = 0
    return internalClassPattern.test(selector)
  })
  const internalClasses = new Set(
    internalSelectors.flatMap((selector) => {
      internalClassPattern.lastIndex = 0
      return [...selector.matchAll(internalClassPattern)].map((match) => match[0])
    })
  )

  for (const className of internalClasses) {
    assert.ok(allowedInternalClasses.has(className), `new HeroUI internal selector: ${className}`)
  }
  assert.ok(
    internalSelectors.length <= 88,
    `HeroUI internal selector count grew from 88 to ${internalSelectors.length}`
  )
})

test('global HeroUI radius and field geometry tokens can shrink but cannot expand', () => {
  const css = readFileSync(compatibilityCssPath, 'utf8')
  const tokens = [...css.matchAll(/--(radius(?:-[\w-]+)?|field-radius)\s*:/g)].map(
    (match) => match[1]
  )

  for (const token of tokens) {
    assert.ok(allowedRadiusTokens.has(token), `new global HeroUI geometry token: --${token}`)
  }
  assert.ok(tokens.length <= allowedRadiusTokens.size)
})

test('Koko compatibility component exports remain bounded', () => {
  const baseFiles = collectSourceFiles('src/renderer/src/components/base')
  const exports = new Set(
    baseFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(/export\s+(?:const|function)\s+(Koko[A-Z]\w*)/g)].map(
        (match) => match[1]
      )
    })
  )

  for (const name of exports) {
    assert.ok(allowedKokoExports.has(name), `new Koko compatibility wrapper: ${name}`)
  }
  assert.ok(exports.size <= allowedKokoExports.size)
})

test('temporary Koko migration shims cannot gain new consumers', () => {
  const sourceFiles = collectSourceFiles(rendererRoot).filter(
    (file) => relative('.', file) !== 'src/renderer/src/components/base/koko-form.tsx'
  )

  for (const [shim, allowedConsumers] of Object.entries(temporaryKokoShimConsumers)) {
    const actualConsumers = sourceFiles
      .filter((file) => new RegExp(`\\b${shim}\\b`).test(readFileSync(file, 'utf8')))
      .map((file) => relative('.', file))

    for (const file of actualConsumers) {
      assert.ok(allowedConsumers.has(file), `new ${shim} consumer added in ${file}`)
    }
    assert.ok(actualConsumers.length <= allowedConsumers.size)
  }
})

test('the native-first ownership contract documents the migration boundary', () => {
  const contract = readFileSync('docs/ui-native-first.md', 'utf8')

  assert.match(contract, /KokoroBox controls layout; HeroUI controls component appearance/)
  assert.match(contract, /Do not add selectors for HeroUI internal classes/)
  assert.match(contract, /10 renderer files importing `@heroui\/react`/)
  assert.match(contract, /88 existing internal-selector occurrences/)
})
