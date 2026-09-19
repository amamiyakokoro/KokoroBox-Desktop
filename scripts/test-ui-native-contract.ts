import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const rendererRoot = 'src/renderer/src'
const appOverridesCssPath = 'src/renderer/src/assets/app-overrides.css'

const allowedKokoExports = new Set([
  'KokoActionMenu',
  'KokoSearchField',
  'KokoSegmentedControl',
  'KokoSelect',
  'KokoTabs',
  'KokoTextField',
  'KokoToolbar',
  'KokoToolbarIconButton'
])

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
  assert.equal(packageJson.devDependencies['framer-motion'], undefined)
  assert.equal(packageJson.devDependencies['react-aria-components'], undefined)
  assert.equal(packageJson.devDependencies['react-aria'], '^3.52.1')
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

  for (const removedShim of ['KokoButton', 'KokoSwitch', 'KokoTooltip']) {
    assert.equal(exports.has(removedShim), false, `${removedShim} must not be reintroduced`)
    for (const file of collectSourceFiles(rendererRoot)) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        new RegExp(`\\b${removedShim}\\b`),
        `${removedShim} must not be consumed by ${file}`
      )
    }
  }
})

test('the native-first ownership contract documents the migration boundary', () => {
  const contract = readFileSync('docs/ui-native-first.md', 'utf8')

  assert.match(contract, /KokoroBox controls layout; HeroUI controls component appearance/)
  assert.match(contract, /Do not add selectors for HeroUI internal classes/)
  assert.match(contract, /canonical `@heroui\/react` and `@heroui\/styles` packages/)
  assert.match(contract, /React Aria `I18nProvider`/)
  assert.match(contract, /zero HeroUI internal selectors/)
  assert.match(contract, /KokoSegmentedControl[\s\S]*`ToggleButtonGroup`/)
  assert.match(contract, /Use `KokoTabs` for page, panel, and section navigation/)
  assert.match(contract, /use `KokoSelect` for numerous,[\s\S]*long, or low-frequency choices/)
})

test('native component appearance is not repainted by dense application surfaces', () => {
  const logs = readFileSync('src/renderer/src/pages/logs.tsx', 'utf8')
  const settingCard = readFileSync('src/renderer/src/components/base/base-setting-card.tsx', 'utf8')
  const denseCardFiles = [
    'src/renderer/src/components/connections/connection-item.tsx',
    'src/renderer/src/components/connections/connection-group-header.tsx',
    'src/renderer/src/components/proxies/proxy-item.tsx'
  ]
  const collectionSurface = readFileSync(
    'src/renderer/src/components/base/management/collection-surface.tsx',
    'utf8'
  )
  const drawerFiles = [
    'src/renderer/src/components/base/base-settings-drawer.tsx',
    'src/renderer/src/components/base/error-detail-drawer.tsx',
    'src/renderer/src/components/connections/connection-detail-modal.tsx',
    'src/renderer/src/components/updater/updater-drawer.tsx'
  ]

  assert.match(logs, /<KokoSelect[\s\S]*density="toolbar"/)
  assert.doesNotMatch(logs, /<Select\.Trigger|<Select\.Popover|<ListBox/)
  assert.match(settingCard, /<Surface[\s\S]*variant="secondary"/)
  assert.doesNotMatch(settingCard, /<Surface[\s\S]*rounded-xl[\s\S]*<\/Surface>/)

  for (const file of denseCardFiles) {
    const source = readFileSync(file, 'utf8')
    const cardClassName =
      source
        .match(/<Card\b[\s\S]*?className=(?:"([^"]*)"|\{`([^`]*)`\})/)
        ?.slice(1)
        .find(Boolean) ?? ''
    assert.doesNotMatch(cardClassName, /\brounded-(?:lg|xl|2xl|3xl)\b|\bshadow-(?:none|sm|md|lg)\b/)
    assert.match(cardClassName, /\boverflow-hidden\b/)
  }

  const collectionCardClassName =
    collectionSurface
      .match(/<Card\b[\s\S]*?className=\{cn\(\s*'([^']*)'/)
      ?.slice(1)
      .find(Boolean) ?? ''
  assert.match(collectionCardClassName, /\boverflow-hidden\b/)
  assert.doesNotMatch(collectionCardClassName, /\brounded-(?:lg|xl|2xl|3xl)\b/)
  assert.match(collectionSurface, /isCurrent && 'border-accent\/55 bg-accent-soft\/35'/)

  for (const file of drawerFiles) {
    const source = readFileSync(file, 'utf8')
    const dialog = source.match(/<Drawer\.Dialog\b[\s\S]*?>/)?.[0] ?? ''
    assert.doesNotMatch(dialog, /\bbg-overlay\b|\bshadow-overlay\b|\brounded-(?:xl|2xl)!?\b/)
  }
})

test('status cards use native semantic variants instead of painted surfaces', () => {
  for (const file of [
    'src/renderer/src/components/mihomo/macos-service-setup.tsx',
    'src/renderer/src/components/mihomo/permission-modal.tsx',
    'src/renderer/src/components/mihomo/service-modal.tsx'
  ]) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /<Card variant="secondary">/)
    assert.doesNotMatch(source, /border-none bg-(?:default|linear)/)
  }
})

test('invalid fields use the native InputGroup state instead of painted geometry', () => {
  const form = readFileSync('src/renderer/src/components/base/koko-form.tsx', 'utf8')
  const consumers = [
    'src/renderer/src/pages/connections.tsx',
    'src/renderer/src/components/mihomo/controller-setting.tsx',
    'src/renderer/src/components/settings/network/dns-settings.tsx'
  ]

  assert.match(form, /data-invalid=\{isInvalid \|\| undefined\}/)
  assert.doesNotMatch(form, /isInvalid && 'ring-1 ring-danger'/)

  for (const file of consumers) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /border-red-500|ring-red-500|border-danger ring-1 ring-danger/)
  }
})

test('interactive cards use native buttons with independent sibling actions', () => {
  const connection = readFileSync(
    'src/renderer/src/components/connections/connection-item.tsx',
    'utf8'
  )
  const connectionGroup = readFileSync(
    'src/renderer/src/components/connections/connection-group-header.tsx',
    'utf8'
  )
  const profile = readFileSync('src/renderer/src/components/profiles/profile-item.tsx', 'utf8')
  const proxyGroup = readFileSync(
    'src/renderer/src/components/proxies/proxy-group-header.tsx',
    'utf8'
  )

  for (const source of [connection, connectionGroup, profile, proxyGroup]) {
    assert.match(source, /<button[\s\S]*type="button"/)
    assert.doesNotMatch(source, /<Card[\s\S]{0,160}?role="button"/)
    assert.doesNotMatch(source, /event\.key !== 'Enter'|event\.key !== ' '/)
    assert.doesNotMatch(source, /stopPropagation\(\)/)
  }

  assert.match(connection, /aria-label=\{hideProcess \? destination/)
  assert.match(connection, /aria-label=\{info\.isActive \? tr\('Close connection'\)/)
  assert.match(connectionGroup, /aria-expanded=\{expanded\}/)
  assert.match(proxyGroup, /aria-expanded=\{isOpen\}/)
  assert.match(profile, /data-card-primary-action/)
  assert.match(profile, /aria-label=\{tr\('Refresh'\)\}/)
})

test('sortable cards keep pointer dragging without fake nested button roles', () => {
  const sensor = readFileSync('src/renderer/src/hooks/use-card-dnd-sensors.ts', 'utf8')
  const profile = readFileSync('src/renderer/src/components/profiles/profile-item.tsx', 'utf8')
  const override = readFileSync('src/renderer/src/components/override/override-item.tsx', 'utf8')
  const siderFiles = collectSourceFiles('src/renderer/src/components/sider')
  const sidebarSettings = readFileSync(
    'src/renderer/src/components/settings/sider-config.tsx',
    'utf8'
  )
  const siderSurfaces = readFileSync('src/renderer/src/components/sider/sider-surfaces.tsx', 'utf8')

  assert.match(sensor, /cardPrimaryActionSelector = '\[data-card-primary-action\]'/)
  assert.match(sensor, /target\.closest\(cardPrimaryActionSelector\)/)
  for (const source of [profile, override]) {
    assert.match(source, /<button[\s\S]*\.\.\.attributes[\s\S]*\.\.\.listeners/)
    assert.match(source, /data-card-primary-action/)
  }

  for (const file of siderFiles) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /\.\.\.attributes/,
      `${file} must not create a second keyboard target around its native button`
    )
  }
  assert.equal(siderSurfaces.match(/data-card-primary-action/g)?.length, 3)
  assert.match(sidebarSettings, /aria-label=\{`\$\{tr\('Move up'\)\}: \$\{item\.title\}`\}/)
  assert.match(sidebarSettings, /aria-label=\{`\$\{tr\('Move down'\)\}: \$\{item\.title\}`\}/)
})
