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
  'KokoStatusIndicator',
  'KokoTabs',
  'KokoTextField',
  'KokoToolbar',
  'KokoToolbarIconButton'
])

const internalClassPattern =
  /\.(?:button|close-button|switch|tabs|select|list-box(?:-item)?|input(?:-group)?|modal|drawer|tooltip|card|toast|slider|meter|progress-bar)(?:(?:__|--)[\w-]+)?(?=[\s.:#>+~,\u005b]|$)/g

const legacyHeroUiUtilityPattern =
  /\b(?:bg|text|border(?:-[trblxy])?|divide(?:-[xy])?|ring|outline|shadow|fill|stroke|from|via|to|caret|decoration)-(?:primary|secondary)(?:-foreground|-[0-9]+)?(?:\/[0-9]+)?\b|\b(?:bg|text|border(?:-[trblxy])?|divide(?:-[xy])?|ring|outline|shadow|fill|stroke|from|via|to|caret|decoration)-content[1-4](?:\/[0-9]+)?\b|\b(?:bg|text|border(?:-[trblxy])?|divide(?:-[xy])?|ring|outline|shadow|fill|stroke|from|via|to|caret|decoration)-(?:foreground|default|success|warning|danger)-(?:50|100|200|300|400|500|600|700|800|900)(?:\/[0-9]+)?\b|\b(?:border(?:-[trblxy])?|divide(?:-[xy])?)-divider(?:\/[0-9]+)?\b|\btext-(?:tiny|small|medium|large)\b|\brounded-(?:small|medium|large)\b|\bopacity-hover\b/g

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

test('the shared application preference controls native reduced motion in every renderer', () => {
  const appConfigProvider = readFileSync('src/renderer/src/hooks/use-app-config.tsx', 'utf8')
  const appOverrides = readFileSync(appOverridesCssPath, 'utf8')

  assert.match(appConfigProvider, /document\.documentElement\.dataset\.reduceMotion = 'true'/)
  assert.match(appConfigProvider, /delete document\.documentElement\.dataset\.reduceMotion/)
  assert.doesNotMatch(appConfigProvider, /dataset\.reduceMotion = 'false'/)
  assert.match(
    appConfigProvider,
    /syncReducedMotionPreference\(appConfig\.disableAnimation === true\)/
  )

  for (const file of [
    'src/renderer/src/main.tsx',
    'src/renderer/src/floating.tsx',
    'src/renderer/src/traymenu.tsx'
  ]) {
    assert.match(readFileSync(file, 'utf8'), /<AppConfigProvider>/)
  }

  assert.match(appOverrides, /:root\[data-reduce-motion='true'\] \.settings-search-target/)
  assert.match(appOverrides, /:root\[data-reduce-motion='true'\] \.rule-list-card/)
})

test('the shared application preference controls next-themes in every renderer', () => {
  const appConfigProvider = readFileSync('src/renderer/src/hooks/use-app-config.tsx', 'utf8')
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')

  assert.match(appConfigProvider, /const \{ setTheme \} = useTheme\(\)/)
  assert.match(appConfigProvider, /const appTheme = appConfig\?\.appTheme/)
  assert.match(appConfigProvider, /setTheme\(appTheme\)/)
  assert.match(app, /setNativeTheme\(appTheme\)/)

  for (const file of [
    'src/renderer/src/main.tsx',
    'src/renderer/src/floating.tsx',
    'src/renderer/src/traymenu.tsx'
  ]) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /<NextThemesProvider attribute="class" enableSystem defaultTheme="dark">/)
    assert.match(source, /<AppConfigProvider>/)
  }
})

test('native title bar controls keep contrast with the resolved color scheme', () => {
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')

  assert.match(app, /const \{ resolvedTheme \} = useTheme\(\)/)
  assert.match(app, /symbolColor: resolvedTheme === 'dark' \? '#fdfdfd' : '#363638'/)
  assert.match(app, /\[appTheme, resolvedTheme, useWindowFrame\]/)
  assert.doesNotMatch(app, /window\.getComputedStyle\(document\.documentElement\)\.color/)
})

test('KokoroBox-owned surfaces share the native wind-chime brand mark', () => {
  const icon = readFileSync(
    'src/renderer/src/components/base/kokorobox-icon.tsx',
    'utf8'
  )
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  const floatingApp = readFileSync('src/renderer/src/FloatingApp.tsx', 'utf8')

  assert.match(icon, /viewBox="0 0 512 512"/)
  assert.match(icon, /fill="currentColor"/)
  assert.match(icon, /aria-hidden="true"/)
  assert.match(icon, /SVGProps<SVGSVGElement>/)
  assert.equal(icon.match(/<path /g)?.length, 1)
  assert.equal(app.match(/<KokoroBoxIcon /g)?.length, 2)
  assert.equal(
    app.match(/platform !== 'darwin' && (?:\(\s*)?<KokoroBoxIcon/g)?.length,
    2
  )
  assert.match(app, /<h3 className="text-lg font-bold leading-8">KokoroBox<\/h3>/)
  assert.equal(floatingApp.match(/<KokoroBoxIcon /g)?.length, 1)
  assert.doesNotMatch(app, /MihomoIcon/)
  assert.doesNotMatch(floatingApp, /MihomoIcon/)
  assert.match(floatingApp, /className="floating-icon [^"]*h-full[^"]*w-6/)
  assert.match(floatingApp, /transform: `rotate\(\$\{rotation\}deg\)`/)
})

test('active source uses native semantic tokens without a legacy theme bridge', () => {
  const sourceFiles = collectFiles('src').filter((file) =>
    /\.(?:css|[cm]?[jt]sx?)$/.test(file)
  )

  for (const file of sourceFiles) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /--heroui-|hsl\(var\(--heroui-/,
      `${file} still consumes a legacy HeroUI token`
    )
  }

  assert.equal(existsSync('src/main/resolve/theme.ts'), false)
})

test('custom CSS theme architecture cannot return through active source', () => {
  const sourceFiles = collectSourceFiles('src')
  const removedThemeApiPattern =
    /\b(?:customTheme|resolveThemes|importThemes|readTheme|writeTheme|applyTheme|normalizeThemeCss|themesDir)\b/
  const offenders = sourceFiles.flatMap((file) => {
    const matches = readFileSync(file, 'utf8').match(removedThemeApiPattern) ?? []
    return matches.length ? [`${file}: ${[...new Set(matches)].join(', ')}`] : []
  })

  assert.deepEqual(offenders, [])
  assert.equal(existsSync('src/renderer/src/components/settings/css-editor-modal.tsx'), false)
})

test('renderer does not use HeroUI v2 utility vocabulary', () => {
  const offenders = collectFiles(rendererRoot)
    .filter((file) => /\.(?:css|[cm]?[jt]sx?)$/.test(file))
    .flatMap((file) => {
      const matches = readFileSync(file, 'utf8').match(legacyHeroUiUtilityPattern) ?? []
      return matches.length ? [`${file}: ${[...new Set(matches)].join(', ')}`] : []
    })

  assert.deepEqual(offenders, [])
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

test('HeroUI form controls own focus appearance without a nested application outline', () => {
  const mainCss = readFileSync('src/renderer/src/assets/main.css', 'utf8')
  const searchField = readFileSync('src/renderer/src/components/base/koko-search-field.tsx', 'utf8')
  const textViewer = readFileSync('src/renderer/src/components/base/text-viewer.tsx', 'utf8')
  const controllerSetting = readFileSync(
    'src/renderer/src/components/mihomo/controller-setting.tsx',
    'utf8'
  )
  const focusRuleStart = mainCss.indexOf('[data-koko-focus-ring]:focus-visible')
  const focusRuleEnd = mainCss.indexOf('\n}', focusRuleStart)
  const focusRule = mainCss.slice(focusRuleStart, focusRuleEnd)

  assert.ok(focusRuleStart >= 0 && focusRuleEnd > focusRuleStart)
  assert.match(focusRule, /^\[data-koko-focus-ring\]:focus-visible/)
  assert.match(focusRule, /outline: 2px solid var\(--focus\)/)
  assert.doesNotMatch(mainCss, /\[data-slot\]/)
  assert.match(textViewer, /data-koko-focus-ring[\s\S]*tabIndex=\{0\}/)
  assert.match(controllerSetting, /aria-label=\{tr\('Access key'\)\}[\s\S]*data-koko-focus-ring/)
  assert.match(searchField, /<InputGroup[\s\S]*variant="secondary"/)
  assert.doesNotMatch(searchField, /focus-visible:/)
})

test('renderer-owned metadata does not reuse HeroUI internal slot attributes', () => {
  for (const file of collectSourceFiles(rendererRoot)) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /data-slot=/,
      `${file} reuses HeroUI's internal data-slot convention`
    )
  }

  const connections = readFileSync('src/renderer/src/pages/connections.tsx', 'utf8')
  assert.match(connections, /data-koko-part="connection-count"/)
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

test('Koko fields expose application semantics instead of the HeroUI v2 Input API', () => {
  const form = readFileSync('src/renderer/src/components/base/koko-form.tsx', 'utf8')
  const searchField = readFileSync('src/renderer/src/components/base/koko-search-field.tsx', 'utf8')

  assert.match(form, /prefix\?: React\.ReactNode/)
  assert.match(form, /suffix\?: React\.ReactNode/)
  assert.match(form, /inputClassName\?: string/)
  assert.match(form, /onChangeValue\?: \(value: string\) => void/)
  assert.match(searchField, /onChangeValue: \(value: string\) => void/)

  for (const [name, source] of [
    ['KokoTextField', form],
    ['KokoSearchField', searchField]
  ]) {
    assert.doesNotMatch(source, /\bonValueChange\b/, `${name} exposes v2 onValueChange`)
    assert.doesNotMatch(source, /\bstartContent\b/, `${name} exposes v2 startContent`)
    assert.doesNotMatch(source, /\bendContent\b/, `${name} exposes v2 endContent`)
    assert.doesNotMatch(source, /\bclassNames\b/, `${name} exposes v2 classNames`)
    assert.doesNotMatch(source, /\bisClearable\b/, `${name} exposes v2 isClearable`)
  }

  for (const file of collectSourceFiles(rendererRoot)) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /KokoTextField\s+as\s+Input/,
      `${file} hides KokoTextField behind a generic Input alias`
    )
  }
})

test('the native-first ownership contract documents the migration boundary', () => {
  const contract = readFileSync('docs/ui-native-first.md', 'utf8')

  assert.match(contract, /KokoroBox controls layout; HeroUI controls component appearance/)
  assert.match(contract, /Do not add selectors for HeroUI internal classes/)
  assert.match(contract, /canonical `@heroui\/react` and `@heroui\/styles` packages/)
  assert.match(contract, /React Aria `I18nProvider`/)
  assert.match(contract, /Renderer utility classes must use HeroUI v3 semantic colors/)
  assert.match(contract, /Raw HTML controls[\s\S]*`data-koko-focus-ring`/)
  assert.match(contract, /Do not infer HeroUI ownership[\s\S]*`data-slot`/)
  assert.match(
    contract,
    /application-owned `prefix`, `suffix`, `inputClassName`, and `onChangeValue`/
  )
  assert.match(contract, /Custom CSS[\s\S]*legacy HeroUI v2 token bridge have been removed/)
  assert.match(contract, /System, Light, and Dark through `appTheme` are the only supported/)
  assert.doesNotMatch(contract, /compatibility bridge for already-installed user themes/)
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

test('sidebar quick controls use one native toggle target', () => {
  const surfaces = readFileSync(
    'src/renderer/src/components/sider/sider-surfaces.tsx',
    'utf8'
  )
  const quickControl = surfaces.slice(surfaces.indexOf('export const SiderQuickControl'))
  const controls = [
    'src/renderer/src/components/sider/sysproxy-switcher.tsx',
    'src/renderer/src/components/sider/tun-switcher.tsx',
    'src/renderer/src/components/sider/dns-card.tsx',
    'src/renderer/src/components/sider/sniff-card.tsx'
  ]

  assert.match(surfaces, /import \{[\s\S]*ToggleButton[\s\S]*\} from '@heroui\/react'/)
  assert.match(quickControl, /<ToggleButton[\s\S]*isSelected=\{enabled\}/)
  assert.match(quickControl, /isDisabled=\{disabled\}/)
  assert.match(quickControl, /onChange=\{\(selected\) => \{[\s\S]*onToggle\(selected\)/)
  assert.doesNotMatch(quickControl, /<button|control: React\.ReactNode|data-sider-control-slot/)
  assert.match(surfaces, /export const SiderIconToggleButton/)

  for (const file of controls) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /<SiderQuickControl/)
    assert.match(source, /<SiderIconToggleButton/)
    assert.doesNotMatch(source, /<Switch|<SiderIconButton|control=\{/)
  }
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
  assert.match(sidebarSettings, /KeyboardSensor/)
  assert.match(sidebarSettings, /sortableKeyboardCoordinates/)
  assert.match(sidebarSettings, /data-sider-order-handle/)
  assert.match(sidebarSettings, /aria-label=\{`\$\{tr\('Reorder'\)\}: \$\{item\.title\}`\}/)
  assert.doesNotMatch(sidebarSettings, /LuArrowUp|LuArrowDown|tr\('Move up'\)|tr\('Move down'\)/)
})
