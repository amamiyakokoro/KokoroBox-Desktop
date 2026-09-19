import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

const rendererRoot = 'src/renderer/src'
const appOverridesCssPath = 'src/renderer/src/assets/app-overrides.css'

const allowedKokoExports = new Set([
  'KokoActionMenu',
  'KokoButton',
  'KokoSelect',
  'KokoSwitch',
  'KokoTabs',
  'KokoTextField',
  'KokoTooltip'
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

test('HeroUI v3 uses canonical packages without migration aliases', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    devDependencies: Record<string, string>
  }
  const sourceFiles = collectSourceFiles(rendererRoot)

  assert.equal(packageJson.devDependencies['@heroui/react'], '3.2.6')
  assert.equal(packageJson.devDependencies['@heroui/styles'], '3.2.6')
  assert.equal(packageJson.devDependencies['@heroui-v3/react'], undefined)
  assert.equal(packageJson.devDependencies['@heroui-v3/styles'], undefined)
  for (const file of sourceFiles) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /@heroui-v3/, `${file} uses a migration alias`)
  }
})

test('HeroUI v3 styles do not load the legacy Tailwind plugin', () => {
  const styleFiles = collectFiles('src/renderer/src/assets').filter((file) => file.endsWith('.css'))
  const styles = styleFiles.map((file) => readFileSync(file, 'utf8')).join('\n')

  assert.doesNotMatch(styles, /@plugin\s+['"][^'"]*hero\.mjs['"]/)
  assert.doesNotMatch(styles, /@source\s+['"][^'"]*@heroui\/theme/)
  assert.equal(existsSync('src/renderer/src/assets/hero.mjs'), false)
})

test('renderer entrypoints preserve locale through React Aria', () => {
  for (const file of [
    'src/renderer/src/main.tsx',
    'src/renderer/src/floating.tsx',
    'src/renderer/src/traymenu.tsx'
  ]) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /import \{ I18nProvider \} from 'react-aria'/)
    assert.match(source, /<I18nProvider locale=\{getLocale\(\)\}>/)
    assert.doesNotMatch(source, /HeroUIProvider/)
  }
})

test('renderer styles and components use native semantic tokens', () => {
  const rendererFiles = collectFiles(rendererRoot).filter((file) =>
    /\.(?:css|[cm]?[jt]sx?)$/.test(file)
  )

  for (const file of rendererFiles) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /--heroui-|hsl\(var\(--heroui-/,
      `${file} still consumes a legacy HeroUI token`
    )
  }

  const legacyThemeBridge = readFileSync('src/main/resolve/theme.ts', 'utf8')
  assert.match(legacyThemeBridge, /--heroui-primary/)
})

test('application overrides do not target HeroUI internal classes', () => {
  const css = readFileSync(appOverridesCssPath, 'utf8')
  const internalSelectors = extractSelectors(css).filter((selector) => {
    internalClassPattern.lastIndex = 0
    return internalClassPattern.test(selector)
  })

  assert.deepEqual(internalSelectors, [])
})

test('application overrides do not redefine HeroUI radius or field geometry', () => {
  const css = readFileSync(appOverridesCssPath, 'utf8')
  const tokens = [...css.matchAll(/--(radius(?:-[\w-]+)?|field-radius)\s*:/g)].map(
    (match) => match[1]
  )

  assert.deepEqual(tokens, [])
})

test('the application imports the renamed overrides stylesheet', () => {
  const mainCss = readFileSync('src/renderer/src/assets/main.css', 'utf8')

  assert.match(mainCss, /@import '\.\/app-overrides\.css';/)
  assert.equal(existsSync('src/renderer/src/assets/main-compatible.css'), false)
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
  assert.match(contract, /canonical `@heroui\/react` and `@heroui\/styles` packages/)
  assert.match(contract, /React Aria `I18nProvider`/)
  assert.match(contract, /zero HeroUI internal selectors/)
})
