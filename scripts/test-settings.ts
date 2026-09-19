import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { mergeSettingsPatch } from '../src/renderer/src/utils/merge-settings-patch.ts'
import {
  groupForSiderKey,
  normalizeSiderOrder
} from '../src/renderer/src/components/sider/sider-order.ts'
import { normalizeCoreVersion } from '../src/renderer/src/components/sider/core-version.ts'
import { formatLogTimestamp } from '../src/renderer/src/components/logs/log-display.ts'
import { formatProxyType } from '../src/renderer/src/components/proxies/proxy-display.ts'

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return collectTsxFiles(path)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : []
  })
}

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
    'src/renderer/src/components/settings/network/sniffer-settings.tsx',
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
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')
  const settingCard = readFileSync('src/renderer/src/components/base/base-setting-card.tsx', 'utf8')
  const general = readFileSync('src/renderer/src/components/settings/general-config.tsx', 'utf8')

  assert.match(settings, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(settings, /event\.key\.toLowerCase\(\) === 'f'/)
  assert.match(settings, /settings-content-header sticky top-0/)
  assert.match(settings, /scrollTo\(\{ top: 0 \}\)/)
  assert.match(settings, /settings-navigation-list/)
  assert.match(settings, /<KokoTabs/)
  assert.match(settings, /variant="secondary"/)
  assert.match(settings, /onChange=\{selectPanel\}/)
  assert.match(settings, /nextParams\.set\('panel', panelKey\)/)
  assert.doesNotMatch(settings, /settings-panel-button/)
  assert.match(settings, /settings-container min-h-full/)
  assert.match(settings, /max-w-\[960px\]/)
  assert.match(settings, /entry\.fallbackLabel/)
  assert.match(settings, /panelLabel/)
  assert.match(settings, /item\.panels\?\.find\(\(panel\) => panel\.key === entry\.panel\)/)
  assert.match(styles, /\.settings-container \{[\s\S]*container-type: inline-size/)
  assert.match(styles, /@container settings \(max-width: 50rem\)/)
  assert.doesNotMatch(styles, /@media \(max-width: 1050px\)/)
  assert.match(styles, /\.settings-navigation-list \{[\s\S]*flex-direction: row/)
  assert.match(styles, /\.settings-navigation-list::-webkit-scrollbar/)
  assert.doesNotMatch(styles, /\.settings-panel-button/)
  assert.doesNotMatch(styles, /\.settings-category-label \{[\s\S]*display: none/)
  assert.match(settingCard, /settings-section__heading/)
  assert.match(settingCard, /text-base font-semibold leading-6 text-foreground/)
  assert.match(settingCard, /settings-section__content border-t border-divider/)
  assert.doesNotMatch(settingCard, /settings-section__content border-y/)
  assert.match(general, /header=\{tr\('Language and notifications'\)\}/)
  assert.match(general, /header=\{tr\('Startup and updates'\)\}/)
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
  assert.match(registry, /key: 'network-behavior'/)
  assert.match(registry, /content: \(\) => <NetworkBehaviorSettings \/>/)
  assert.match(registry, /key: 'sniffer'/)
  assert.match(registry, /content: \(\) => <Sniffer embedded \/>/)
  assert.match(settings, /selected\.panels/)
  assert.match(settings, /selectedPanel\?\.content\(\)/)
  assert.match(routes, /settings\?section=network&panel=system-proxy/)
  assert.match(routes, /settings\?section=network&panel=tun/)
  assert.match(routes, /settings\?section=network&panel=dns/)
  assert.match(routes, /settings\?section=network&panel=mihomo/)
  assert.match(routes, /settings\?section=network&panel=sniffer/)
  assert.match(sider, /settings\?section=network&panel=system-proxy/)
  assert.match(sider, /settings\?section=network&panel=tun/)
  assert.match(sider, /settings\?section=network&panel=dns/)
  assert.match(sider, /settings\?section=network&panel=mihomo/)
  assert.match(sider, /settings\?section=network&panel=sniffer/)
})

test('feature settings only surface save actions for dirty embedded panels', () => {
  const shared = readFileSync('src/renderer/src/components/base/base-feature-settings.tsx', 'utf8')
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')
  const featurePages = [
    'src/renderer/src/components/settings/network/system-proxy-settings.tsx',
    'src/renderer/src/components/settings/network/tun-settings.tsx',
    'src/renderer/src/components/settings/network/dns-settings.tsx',
    'src/renderer/src/components/settings/network/sniffer-settings.tsx',
    'src/renderer/src/components/settings/network/mihomo-settings.tsx'
  ]

  assert.match(shared, /if \(!isDirty\) return null/)
  assert.match(shared, /action\?: ReactNode/)
  assert.match(shared, /feature-settings-layout__action/)
  assert.match(styles, /\.feature-settings-layout__action/)
  assert.match(styles, /\.feature-settings-layout--has-action/)

  for (const page of featurePages) {
    const source = readFileSync(page, 'utf8')
    assert.match(source, /<FeatureSettingsLayout[\s\S]*action=/)
    assert.doesNotMatch(source, /mx-auto flex w-full max-w-\[1040px\] justify-end/)
    assert.match(source, /useUnsavedChangesGuard/)
  }
})

test('shared settings primitives isolate HeroUI v3 compound APIs', () => {
  const primitiveFiles = [
    'src/renderer/src/components/base/base-page.tsx',
    'src/renderer/src/components/base/base-setting-item.tsx',
    'src/renderer/src/components/base/base-setting-card.tsx',
    'src/renderer/src/components/base/base-feature-settings.tsx',
    'src/renderer/src/components/base/border-switch.tsx',
    'src/renderer/src/components/base/base-list-editor.tsx',
    'src/renderer/src/components/base/interface-select.tsx',
    'src/renderer/src/components/base/base-controls.tsx',
    'src/renderer/src/components/base/koko-form.tsx',
    'src/renderer/src/components/base/koko-collections.tsx'
  ]

  for (const file of primitiveFiles) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /from '@heroui\/react'/)
    assert.match(source, /from '@heroui-v3\/react'/)
  }

  const borderSwitch = readFileSync('src/renderer/src/components/base/border-switch.tsx', 'utf8')
  const settingCard = readFileSync('src/renderer/src/components/base/base-setting-card.tsx', 'utf8')
  const listEditor = readFileSync('src/renderer/src/components/base/base-list-editor.tsx', 'utf8')
  const interfaceSelect = readFileSync(
    'src/renderer/src/components/base/interface-select.tsx',
    'utf8'
  )

  assert.match(borderSwitch, /<Switch\.Content>/)
  assert.match(borderSwitch, /<Switch\.Control/)
  assert.match(borderSwitch, /<Switch\.Thumb \/>/)
  assert.match(borderSwitch, /onChange=\{onChange \?\? onValueChange\}/)
  assert.doesNotMatch(borderSwitch, /classNames=/)
  assert.match(settingCard, /<Disclosure>/)
  assert.match(settingCard, /<Surface/)
  assert.match(listEditor, /<Tooltip\.Content/)
  assert.match(listEditor, /<KokoTextField/)
  assert.match(listEditor, /<KokoButton/)
  assert.match(listEditor, /aria-label=\{tr\('Delete'\)\}/)
  assert.match(listEditor, /variant="ghost"/)
  assert.doesNotMatch(listEditor, /variant="danger-soft"/)
  assert.match(interfaceSelect, /<Select\.Trigger/)
  assert.match(interfaceSelect, /<ListBox\.Item/)
})

test('system proxy fields keep editable lists inside the settings control column', () => {
  const proxy = readFileSync(
    'src/renderer/src/components/settings/network/system-proxy-settings.tsx',
    'utf8'
  )

  assert.match(proxy, /description=\{tr\('Leave empty to use 127\.0\.0\.1'\)\}/)
  assert.match(proxy, /className="w-full max-w-72"/)
  assert.match(proxy, /placeholder="127\.0\.0\.1"/)
  assert.doesNotMatch(
    proxy,
    /placeholder=\{tr\('Default: 127\.0\.0\.1\. Change only if needed'\)\}/
  )
  assert.match(
    proxy,
    /<SettingItem title=\{tr\('Proxy bypass list'\)\} align="start">[\s\S]*?<EditableList[\s\S]*?<\/SettingItem>/
  )
})

test('settings and Mihomo forms share the KokoroBox HeroUI v3 conventions', () => {
  const form = readFileSync('src/renderer/src/components/base/koko-form.tsx', 'utf8')
  const controls = readFileSync('src/renderer/src/components/base/base-controls.tsx', 'utf8')
  const migratedFiles = [
    ...collectTsxFiles('src/renderer/src/components/settings'),
    ...collectTsxFiles('src/renderer/src/components/mihomo'),
    ...collectTsxFiles('src/renderer/src/components/dns')
  ]

  for (const file of migratedFiles) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /from '@heroui\/react'/,
      `${file} still imports HeroUI v2`
    )
  }

  assert.match(form, /export const KokoTextField/)
  assert.match(form, /<InputGroup\.Input/)
  assert.match(form, /export const KokoSelect/)
  assert.match(form, /<Select\.Trigger/)
  assert.match(form, /<Select\.Value className=/)
  assert.match(form, /selectedText/)
  assert.match(form, /density\?: 'normal' \| 'compact'/)
  assert.match(form, /density = 'normal'/)
  assert.match(form, /variant\?: SelectProps<object>\['variant'\]/)
  assert.match(form, /variant = 'primary'/)
  assert.match(form, /variant=\{variant\}/)
  assert.match(form, /density === 'compact'/)
  assert.match(form, /min-h-8 px-2 py-1/)
  assert.doesNotMatch(form, /koko-select__popover|shadow-overlay/)
  assert.doesNotMatch(form, /min-h-8 px-2\.5 py-1\.5/)
  assert.match(form, /labelPlacement\?: 'inside' \| 'outside'/)
  assert.match(form, /<Select\.Indicator \/>/)
  assert.match(form, /<Select\.Popover/)
  assert.match(form, /<ListBox\.Item/)
  assert.match(form, /export const KokoSwitch/)
  assert.match(form, /<Switch\.Content>/)
  assert.match(form, /<Switch\.Control>/)
  assert.match(form, /<Switch\.Thumb \/>/)
  assert.match(controls, /export const SettingTabs/)
  assert.match(controls, /variant\?: React\.ComponentProps<typeof Tabs>\['variant'\]/)
  assert.match(controls, /variant=\{variant\}/)
  assert.match(controls, /<Tabs\.List/)
  assert.match(controls, /<Tabs\.Indicator \/>/)
  assert.doesNotMatch(
    controls,
    /indicatorClassName|listClassName|listContainerClassName|tabClassName/
  )
})

test('collection and overlay primitives preserve HeroUI v3 identity and selection semantics', () => {
  const rendererFiles = collectTsxFiles('src/renderer/src')
  const legacyCollectionNames = new Set([
    'Accordion',
    'AccordionItem',
    'Dropdown',
    'DropdownItem',
    'DropdownMenu',
    'DropdownTrigger',
    'Modal',
    'ModalBody',
    'ModalContent',
    'ModalFooter',
    'ModalHeader',
    'Select',
    'SelectItem',
    'Tab',
    'Tabs'
  ])

  for (const file of rendererFiles) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(
      source,
      /<Dropdown\.Trigger\b[\s\S]*?>\s*<(?:Button|KokoButton)\b/,
      `${file} nests a button inside the React Aria dropdown trigger`
    )
    for (const match of source.matchAll(
      /import\s*\{([\s\S]*?)\}\s*from\s*['"]@heroui\/react['"]/g
    )) {
      const names = match[1]
        .split(',')
        .map((name) => name.trim().split(/\s+as\s+/)[0])
        .filter(Boolean)
      const legacyCollections = names.filter((name) => legacyCollectionNames.has(name))
      assert.deepEqual(legacyCollections, [], `${file} still imports HeroUI v2 collections`)
    }
  }

  const form = readFileSync('src/renderer/src/components/base/koko-form.tsx', 'utf8')
  const menus = readFileSync('src/renderer/src/components/base/koko-collections.tsx', 'utf8')
  const tabs = readFileSync('src/renderer/src/components/base/base-controls.tsx', 'utf8')
  const connections = readFileSync('src/renderer/src/pages/connections.tsx', 'utf8')
  const profiles = readFileSync('src/renderer/src/pages/profiles.tsx', 'utf8')
  const profileItem = readFileSync('src/renderer/src/components/profiles/profile-item.tsx', 'utf8')
  const tray = readFileSync('src/renderer/src/TrayMenuApp.tsx', 'utf8')
  const groupModal = readFileSync(
    'src/renderer/src/components/app-routing/group-name-modal.tsx',
    'utf8'
  )

  assert.match(form, /<ListBox\.Item[\s\S]*id=\{option\.id\}/)
  assert.match(form, /textValue=/)
  assert.match(form, /option\.description/)
  assert.match(form, /isPlaceholder \? \(placeholder \?\? defaultChildren\) : selectedText/)
  assert.match(form, /density\?: 'normal' \| 'compact'/)
  assert.match(form, /density = 'normal'/)
  assert.match(form, /selectionMode="multiple"/)
  assert.match(form, /value=\{props\.value\}/)
  assert.match(menus, /<Dropdown\.Item[\s\S]*id=\{item\.id\}/)
  assert.match(menus, /textValue=\{item\.textValue\}/)
  assert.match(menus, /onAction=\{\(key\) => void onAction\(String\(key\)\)\}/)
  assert.match(menus, /<Dropdown>\s*<Button/)
  assert.match(menus, /className=\{buttonClassName\}/)
  assert.match(menus, /fullWidth=\{buttonFullWidth\}/)
  assert.match(menus, /isIconOnly=\{isIconOnly\}/)
  assert.match(menus, /size=\{size\}/)
  assert.match(menus, /variant=\{buttonVariant\}/)
  assert.doesNotMatch(
    menus,
    /KokoButton|KokoButtonProps|buttonColor|buttonVariants|resolveKokoButtonVariant/
  )
  assert.match(tabs, /selectedKey=\{selectedKey\}/)
  assert.match(tabs, /variant=\{variant\}/)
  assert.match(tabs, /onSelectionChange=\{\(key\) => void onChange\(String\(key\)\)\}/)
  assert.match(tabs, /<Tabs\.Tab[\s\S]*id=\{option\.id\}/)
  assert.match(connections, /<KokoTabs[\s\S]*variant="secondary"/)
  assert.match(connections, /data-slot="connection-count"/)
  assert.doesNotMatch(connections, /\bBadge\b/)
  assert.match(profiles, /buttonClassName="[^"]*h-8[^"]*w-8[^"]*min-w-8/)
  assert.match(profiles, /buttonVariant="primary"/)
  assert.doesNotMatch(profiles, /buttonColor=/)
  assert.match(profileItem, /buttonClassName="[^"]*h-8[^"]*w-8[^"]*min-w-8/)
  assert.match(tray, /<Accordion[\s\S]*allowsMultipleExpanded/)
  assert.match(tray, /<Accordion\.Item[\s\S]*id=\{group\.name\}/)
  assert.match(tray, /<Accordion\.Trigger/)
  assert.match(tray, /<Accordion\.Panel>/)
  assert.match(groupModal, /<Modal\.Backdrop\b/)
  assert.match(groupModal, /<Modal\.Container>/)
  assert.match(groupModal, /<Modal\.Dialog\b/)
  assert.match(groupModal, /<Modal\.Heading>/)
})

test('renderer components never mix HeroUI v2 and v3 in one file', () => {
  const rendererFiles = collectTsxFiles('src/renderer/src')
  const migrationPriorityFiles = [
    'src/renderer/src/pages/logs.tsx',
    'src/renderer/src/pages/proxies.tsx',
    'src/renderer/src/components/resources/viewer.tsx',
    'src/renderer/src/components/sider/profile-card.tsx',
    'src/renderer/src/components/mihomo/service-modal.tsx',
    'src/renderer/src/components/profiles/profile-item.tsx',
    'src/renderer/src/components/mihomo/interface-modal.tsx',
    'src/renderer/src/components/mihomo/permission-modal.tsx',
    'src/renderer/src/components/override/edit-file-modal.tsx',
    'src/renderer/src/components/resources/proxy-provider.tsx',
    'src/renderer/src/components/profiles/edit-file-modal.tsx',
    'src/renderer/src/components/mihomo/macos-service-setup.tsx',
    'src/renderer/src/components/connections/connection-item.tsx',
    'src/renderer/src/components/connections/connection-group-header.tsx'
  ]

  for (const file of rendererFiles) {
    const source = readFileSync(file, 'utf8')
    const importsV2 = /from '@heroui\/react'/.test(source)
    const importsV3 = /from '@heroui-v3\/react'/.test(source)
    assert.ok(!(importsV2 && importsV3), `${file} mixes HeroUI v2 and v3`)
  }

  for (const file of migrationPriorityFiles) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /from '@heroui\/react'/,
      `${file} still imports HeroUI v2`
    )
  }
})

test('migrated HeroUI v3 cards preserve layout safety without requiring v2 spacing', () => {
  const proxyGroups = readFileSync('src/renderer/src/pages/proxies.tsx', 'utf8')
  const connection = readFileSync(
    'src/renderer/src/components/connections/connection-item.tsx',
    'utf8'
  )
  const connectionGroup = readFileSync(
    'src/renderer/src/components/connections/connection-group-header.tsx',
    'utf8'
  )
  const profile = readFileSync('src/renderer/src/components/profiles/profile-item.tsx', 'utf8')
  const profilesPage = readFileSync('src/renderer/src/pages/profiles.tsx', 'utf8')

  const cardClassName = (source: string, label: string): string => {
    const match = source.match(/<Card\b[\s\S]*?className=(?:"([^"]*)"|\{`([^`]*)`\})/)
    const className = match?.[1] ?? match?.[2]
    assert.ok(className, `${label} must give its v3 Card explicit root classes`)
    return className
  }

  for (const [label, source] of [
    ['proxy group', proxyGroups],
    ['connection', connection],
    ['connection group', connectionGroup],
    ['profile', profile]
  ] as const) {
    const classes = cardClassName(source, label).split(/\s+/)
    assert.ok(classes.includes('overflow-hidden'), `${label} Card must contain its content`)
    assert.ok(classes.includes('min-w-0'), `${label} Card must be allowed to shrink`)
  }

  assert.match(connection, /<Card\.Header className="[^"]*\bflex-row\b/)
  assert.match(profile, /className="col-span-1 grid min-w-0 touch-sortable-card"/)
  assert.match(profile, /<Card\.Content className="[^"]*\bpx-3\b/)
  assert.match(profile, /<Card\.Footer className="[^"]*\bpx-3\b/)
  assert.match(profilesPage, /repeat\(auto-fit,minmax\(min\(17rem,100%\),1fr\)\)/)
  assert.doesNotMatch(profilesPage, /sm:grid-cols-2|lg:grid-cols-3|xl:grid-cols-4/)
})

test('Phase 9 card-heavy surfaces use native v3 anatomy and semantic interactions', () => {
  const files = [
    'src/renderer/src/components/rules/rule-item.tsx',
    'src/renderer/src/components/proxies/proxy-item.tsx',
    'src/renderer/src/components/override/override-item.tsx',
    'src/renderer/src/components/app-routing/rule-row.tsx',
    'src/renderer/src/pages/app-routing.tsx'
  ]

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /from '@heroui\/react'/, `${file} still imports HeroUI v2`)
    assert.match(source, /from '@heroui-v3\/react'/, `${file} does not import HeroUI v3`)
    assert.doesNotMatch(source, /CardBody|isPressable|shadow="(?:none|sm)"/)
  }

  const rule = readFileSync('src/renderer/src/components/rules/rule-item.tsx', 'utf8')
  const proxy = readFileSync('src/renderer/src/components/proxies/proxy-item.tsx', 'utf8')
  const override = readFileSync('src/renderer/src/components/override/override-item.tsx', 'utf8')
  const appRule = readFileSync('src/renderer/src/components/app-routing/rule-row.tsx', 'utf8')

  assert.match(rule, /<Card variant="secondary" className="w-full p-3">/)
  assert.match(rule, /<Card\.Content/)
  assert.match(proxy, /<Card[\s\S]*variant="secondary"/)
  assert.match(proxy, /<button[\s\S]*aria-pressed=\{selected\}[\s\S]*onClick=\{selectProxy\}/)
  assert.match(override, /<Card className="h-full w-full min-w-0 overflow-hidden">/)
  assert.match(override, /<button[\s\S]*disabled=\{disableOpen\}/)
  assert.match(appRule, /<Card variant="secondary" className="p-3">/)
  assert.match(appRule, /<InputGroup variant="secondary"/)
})

test('page settings drawers use the shared compact inspector behavior', () => {
  const drawer = readFileSync('src/renderer/src/components/base/base-settings-drawer.tsx', 'utf8')
  const settingItem = readFileSync('src/renderer/src/components/base/base-setting-item.tsx', 'utf8')
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')
  const connections = readFileSync(
    'src/renderer/src/components/connections/connection-setting-drawer.tsx',
    'utf8'
  )
  const appRouting = readFileSync(
    'src/renderer/src/components/app-routing/app-routing-setting-drawer.tsx',
    'utf8'
  )
  const consumers = [
    connections,
    appRouting,
    readFileSync('src/renderer/src/components/profiles/profile-setting-drawer.tsx', 'utf8'),
    readFileSync('src/renderer/src/components/proxies/proxy-setting-drawer.tsx', 'utf8')
  ]

  assert.match(drawer, /const DRAWER_CLOSE_ANIMATION_MS = 220/)
  assert.match(drawer, /variant="transparent"/)
  assert.match(drawer, /w-\[min\(432px,calc\(100vw-16px\)\)\]/)
  assert.match(drawer, /w-\[min\(520px,calc\(100vw-16px\)\)\]/)
  assert.match(drawer, /aria-labelledby=\{headingId\}/)
  assert.match(drawer, /aria-label=\{tr\('Close'\)\}/)
  assert.match(styles, /\.page-settings-drawer \.setting-item--compact\s*\{[^}]*min-height:/s)
  assert.match(styles, /\.setting-item \[data-setting-input='number'\]/)
  assert.doesNotMatch(styles, /\.page-settings-drawer-backdrop\s*\{/)
  assert.match(settingItem, /description\?: React\.ReactNode/)

  for (const consumer of consumers) {
    assert.match(consumer, /<PageSettingsDrawer/)
    assert.match(consumer, /<PageSettingsSection/)
  }

  assert.match(connections, /onBlur=\{applyInterval\}/)
  assert.match(connections, /event\.key === 'Enter'/)
  assert.doesNotMatch(connections, /tr\('Confirm'\)/)
  assert.match(appRouting, /description=\{tr\(/)
  assert.doesNotMatch(appRouting, /<Tooltip|SettingHelp/)
})

test('desktop sidebar separates controls, live status and navigation', () => {
  const sider = readFileSync('src/renderer/src/components/sider/sider-cards.tsx', 'utf8')
  const surfaces = readFileSync('src/renderer/src/components/sider/sider-surfaces.tsx', 'utf8')
  const sidebarSettings = readFileSync(
    'src/renderer/src/components/settings/sider-config.tsx',
    'utf8'
  )
  const systemProxy = readFileSync(
    'src/renderer/src/components/sider/sysproxy-switcher.tsx',
    'utf8'
  )
  const tun = readFileSync('src/renderer/src/components/sider/tun-switcher.tsx', 'utf8')
  const appRouting = readFileSync('src/renderer/src/components/sider/app-routing-card.tsx', 'utf8')
  const appRoutingStatus = readFileSync('src/renderer/src/utils/app-routing-status.ts', 'utf8')
  const proxy = readFileSync('src/renderer/src/components/sider/proxy-card.tsx', 'utf8')
  const core = readFileSync('src/renderer/src/components/sider/mihomo-core-card.tsx', 'utf8')
  const dns = readFileSync('src/renderer/src/components/sider/dns-card.tsx', 'utf8')
  const sniff = readFileSync('src/renderer/src/components/sider/sniff-card.tsx', 'utf8')
  const kokoro = readFileSync('src/renderer/src/components/sider/kokoro-setting-card.tsx', 'utf8')
  const rules = readFileSync('src/renderer/src/components/sider/rule-card.tsx', 'utf8')
  const profile = readFileSync('src/renderer/src/components/sider/profile-card.tsx', 'utf8')
  const connections = readFileSync('src/renderer/src/components/sider/conn-card.tsx', 'utf8')
  const outboundMode = readFileSync(
    'src/renderer/src/components/sider/outbound-mode-switcher.tsx',
    'utf8'
  )
  const quickControl = surfaces.slice(surfaces.indexOf('export const SiderQuickControl'))

  for (const file of readdirSync('src/renderer/src/components/sider').filter((name) =>
    name.endsWith('.tsx')
  )) {
    const source = readFileSync(`src/renderer/src/components/sider/${file}`, 'utf8')
    assert.doesNotMatch(source, /from '@heroui\/react'/, `${file} still imports HeroUI v2`)
  }

  assert.match(sider, /SiderSection title=\{tr\('Quick controls'\)\} columns=\{2\}/)
  assert.match(sider, /SiderSection title=\{tr\('Current status'\)\}/)
  assert.match(sider, /SiderSection title=\{tr\('Navigation'\)\}/)
  assert.match(sider, /groupForSiderKey\(String\(active\.id\)\)/)
  assert.match(sider, /const configuredOrder = useMemo/)
  assert.doesNotMatch(sider, /const configuredOrder = normalizeSiderOrder/)
  assert.match(sider, /orderedKeys\(quickControlKeys\)/)
  assert.match(sider, /orderedKeys\(currentStatusKeys\)/)
  assert.match(sider, /orderedKeys\(navigationKeys\)/)
  assert.match(surfaces, /export const SiderQuickControl/)
  assert.match(surfaces, /export const SiderNavItem/)
  assert.match(surfaces, /export const SiderStatusCard/)
  assert.match(surfaces, /export const SiderIconButton/)
  assert.match(surfaces, /<Tooltip\.Content placement=\{placement\}>/)
  assert.match(surfaces, /metadataSeparator = '·'/)
  assert.match(surfaces, /showChevron \?\? !actions/)
  assert.match(surfaces, /prioritizeDescription \? 'min-w-0 truncate' : 'shrink-0'/)
  assert.match(surfaces, /columns === 2 \? 'grid grid-cols-2 gap-1\.5' : 'flex flex-col gap-1\.5'/)
  assert.match(surfaces, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(surfaces, /navigationStatusIndicatorClasses/)
  assert.match(surfaces, /group-focus-within:text-foreground-500/)
  assert.equal(quickControl.match(/<button/g)?.length, 1)
  assert.match(quickControl, /aria-label=\{title\}/)
  assert.match(quickControl, /className="absolute right-2\.5 top-2"/)
  assert.match(quickControl, /w-full truncate whitespace-nowrap text-xs/)
  assert.match(sidebarSettings, /title: tr\('Quick controls'\)/)
  assert.match(sidebarSettings, /title: tr\('Current status'\)/)
  assert.match(sidebarSettings, /title: tr\('Navigation'\)/)
  assert.match(sidebarSettings, /moveSiderItem/)
  assert.match(sidebarSettings, /aria-label=\{`\$\{tr\('Move up'\)\}: \$\{item\.title\}`\}/)
  assert.match(sidebarSettings, /aria-label=\{`\$\{tr\('Move down'\)\}: \$\{item\.title\}`\}/)
  assert.match(sidebarSettings, /patchAppConfig\(\{ siderOrder: nextOrder \}\)/)
  assert.match(sidebarSettings, /isSelected=\{status !== 'hidden'\}/)
  assert.doesNotMatch(sidebarSettings, /<Radio/)
  assert.match(systemProxy, /<SiderQuickControl/)
  assert.doesNotMatch(systemProxy, /\.\.\.attributes/)
  assert.match(tun, /<SiderQuickControl/)
  assert.doesNotMatch(tun, /\.\.\.attributes/)
  assert.match(appRouting, /getAppRoutingStatus/)
  assert.match(appRouting, /getAppRoutingStatusMessage/)
  assert.match(appRouting, /isAppRoutingRuleEffectivelyEnabled/)
  assert.match(appRouting, /statusTone=\{statusTone\}/)
  assert.match(appRouting, /<SiderStatusCard/)
  assert.match(appRouting, /role="status"/)
  assert.match(appRoutingStatus, /export function getAppRoutingStatusLabel/)
  assert.match(appRoutingStatus, /export function getAppRoutingStatusMessage/)
  assert.match(proxy, /<SiderStatusCard/)
  assert.match(proxy, /status=\{primaryGroup\?\.now/)
  assert.match(proxy, /metadataSeparator="→"/)
  assert.match(core, /<SiderStatusCard/)
  assert.match(core, /status=\{version \? memoryLabel : undefined\}/)
  assert.match(core, /statusTitle=\{version \? `\$\{tr\('Memory'\)\}/)
  assert.match(core, /label=\{tr\('Restart'\)\}/)
  assert.match(dns, /<SiderNavItem/)
  assert.match(dns, /status=\{enable \? tr\('Enabled'\) : tr\('Disabled'\)\}/)
  assert.doesNotMatch(dns, /patchMihomoConfig/)
  assert.match(sniff, /<SiderNavItem/)
  assert.match(sniff, /status=\{enable \? tr\('Enabled'\) : tr\('Disabled'\)\}/)
  assert.doesNotMatch(sniff, /patchMihomoConfig/)
  assert.match(kokoro, /<SiderNavItem/)
  assert.doesNotMatch(kokoro, /Account, plan and profile import/)
  assert.match(rules, /description=\{String\(rules\?\.rules\?\.length \?\? 0\)\}/)
  assert.doesNotMatch(rules, /tr\('\{0\} rules'/)
  assert.match(profile, /<SiderStatusCard/)
  assert.match(profile, /label=\{tr\('Runtime configuration'\)\}/)
  assert.match(profile, /label=\{tr\('Refresh'\)\}/)
  assert.match(outboundMode, /<Tabs\.List/)
  assert.match(outboundMode, /<Tabs\.Indicator/)
  assert.match(surfaces, /title=\{title\}/)
  assert.doesNotMatch(profile, /<Card/)
  assert.match(connections, /<SiderStatusCard/)
  assert.match(connections, /<TrafficChart/)
  assert.doesNotMatch(connections, /<Card/)

  assert.equal(groupForSiderKey('sysproxy'), 'quick')
  assert.equal(groupForSiderKey('profile'), 'status')
  assert.equal(groupForSiderKey('dns'), 'navigation')
  assert.notEqual(groupForSiderKey('sysproxy'), groupForSiderKey('profile'))
  assert.deepEqual(normalizeSiderOrder(['tun', 'sysproxy', 'tun', 'unknown']).slice(0, 2), [
    'tun',
    'sysproxy'
  ])
  assert.equal(normalizeCoreVersion(' v1.19.31 '), 'v1.19.31')
  assert.equal(normalizeCoreVersion('mihomo v1.19.31 linux amd64'), 'v1.19.31')
  assert.equal(normalizeCoreVersion('Meta v1.19.31-abcdef'), 'v1.19.31')
  assert.equal(normalizeCoreVersion('v.'), undefined)
  assert.equal(normalizeCoreVersion('mihomo development build'), undefined)
  assert.equal(normalizeCoreVersion(''), undefined)
  assert.match(core, /coreVersion \?\? tr\('Unknown'\)/)
  assert.match(core, /descriptionTitle=\{originalVersion\}/)
  assert.match(core, /prioritizeDescription/)
})

test('proxy group rows stay compact while preserving semantic metadata and actions', () => {
  const page = readFileSync('src/renderer/src/pages/proxies.tsx', 'utf8')
  const item = readFileSync('src/renderer/src/components/proxies/proxy-item.tsx', 'utf8')
  const tooltip = readFileSync(
    'src/renderer/src/components/proxies/proxy-detail-tooltip.tsx',
    'utf8'
  )

  assert.match(page, /<Card\.Content className="min-h-14 w-full px-3 py-2">/)
  assert.match(page, /function GroupMetadata/)
  assert.match(page, /getGroupTypeLabel\(group\.type\)/)
  assert.match(page, /→/)
  assert.match(page, /tr\('\{0\} nodes', \[group\.all\.length\]\)/)
  assert.doesNotMatch(page, /<Chip/)
  assert.match(page, /aria-label=\{tr\('Test group latency'\)\}/)
  assert.match(page, /aria-label=\{tr\('Show selected proxy'\)\}/)
  assert.match(page, /onPress=\{\(\) => onScrollToProxy\(index\)\}/)
  assert.doesNotMatch(page, /searchVisible|searchValue|onUpdateSearch|CollapseInput/)
  assert.doesNotMatch(page, /Search group|Proxy group actions/)
  assert.match(page, /let groupProxies = group\.all as ProxyLike\[\]/)
  assert.match(page, /proxyDisplayOrder === 'delay'/)
  assert.match(page, /proxyDisplayOrder === 'name'/)
  assert.match(page, /proxyGroupPageCache\.isOpen/)
  assert.match(page, /<GroupedVirtuoso/)
  assert.match(page, /mode === 'global' && g\[index\]\.name\.toUpperCase\(\) === 'GLOBAL'/)
  assert.match(page, /title=\{group\.name\}/)
  assert.match(page, /title=\{group\.now\}/)
  assert.match(page, /onGroupDelay\(index\)/)
  assert.match(page, /shadow-none/)
  assert.match(page, /gap-2 pt-2 mx-3/)
  assert.match(item, /return `\$\{delay\} ms`/)
  assert.match(item, /variant="secondary"/)
  assert.match(item, /aria-pressed=\{selected\}/)
  assert.doesNotMatch(item, /isPressable|CardBody/)
  assert.doesNotMatch(item, /delay < 500/)
  assert.match(tooltip, /return `\$\{delay\} ms`/)
  assert.doesNotMatch(tooltip, /delay < 500/)
  assert.equal(formatProxyType('Socks5'), 'SOCKS')
  assert.equal(formatProxyType('Http'), 'HTTP')
  assert.equal(formatProxyType('Trojan'), 'Trojan')
})

test('connection rows stay dense while preserving realtime data and grouped actions', () => {
  const page = readFileSync('src/renderer/src/pages/connections.tsx', 'utf8')
  const item = readFileSync('src/renderer/src/components/connections/connection-item.tsx', 'utf8')
  const group = readFileSync(
    'src/renderer/src/components/connections/connection-group-header.tsx',
    'utf8'
  )

  assert.match(item, /style=\{\{ minHeight: 68 \}\}/)
  assert.match(item, /className="size-11 bg-transparent"/)
  assert.match(item, /text-\[11px\] text-foreground-400/)
  assert.match(item, /group-hover:opacity-100 group-focus-within:opacity-100/)
  assert.match(item, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/)
  assert.match(item, /font-medium text-primary tabular-nums/)
  assert.match(item, /title=\{hideProcess \? destination/)

  assert.match(page, /Close all \{0\} active connections/)
  assert.match(page, /Clear all \{0\} records/)
  assert.doesNotMatch(page, /content=\{filteredConnections\.length\}/)
  assert.match(page, /defaultItemHeight=\{68\}/)
  assert.match(page, /mihomoCloseConnections\(\)/)
  assert.match(page, /connectionInterval = 500/)
  assert.match(page, /aria-label=\{tr\('Sort field'\)\}[\s\S]*density="compact"/)
  for (const sortOption of [
    "id: 'upload'",
    "id: 'download'",
    "id: 'uploadSpeed'",
    "id: 'downloadSpeed'",
    "id: 'time'",
    "id: 'process'"
  ]) {
    assert.match(page, new RegExp(sortOption))
  }

  assert.match(group, /aria-expanded=\{expanded\}/)
  assert.match(group, /className="min-h-14 w-full p-0"/)
  assert.match(group, /className="mr-2 size-10 shrink-0 bg-transparent"/)
  assert.match(group, /group-hover:opacity-100 group-focus-within:opacity-100/)
  assert.match(group, /onPress=\{\(\) => onCloseAll\(groupKey\)\}/)
})

test('connection details use a sectioned desktop inspector without losing diagnostics', () => {
  const detail = readFileSync(
    'src/renderer/src/components/connections/connection-detail-modal.tsx',
    'utf8'
  )
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')

  assert.match(detail, /<Drawer\.Backdrop/)
  assert.match(detail, /placement="right"/)
  assert.doesNotMatch(detail, /<Modal\./)
  assert.match(detail, /variant="secondary"/)
  assert.doesNotMatch(styles, /\.connection-detail-modal \.tabs/)
  assert.ok(detail.indexOf('<Tabs.ListContainer>') < detail.indexOf('<Drawer.Body'))
  assert.match(detail, /const summaryRows: DetailRow\[\]/)
  assert.match(detail, /const trafficRows: DetailRow\[\]/)
  assert.match(detail, /const connectionRows: DetailRow\[\]/)
  assert.match(detail, /const processRows: DetailRow\[\]/)
  assert.match(detail, /const advancedRows: DetailRow\[\]/)
  assert.match(detail, /<details className=/)
  assert.match(detail, /<summary className=/)
  assert.match(detail, /<BaseEditor value=\{rawJson\} language="json" readOnly \/>/)
  assert.match(detail, /grid-cols-\[minmax\(104px,0\.34fr\)_minmax\(0,1fr\)_auto\]/)
  assert.match(detail, /ariaLabel=\{`\$\{tr\('Copy rule'\)\}: \$\{row\.title\}`\}/)
  assert.match(detail, /buttonVariant="ghost"/)
  assert.match(detail, /min-h-9/)

  for (const field of [
    'Connection start time',
    'Proxy chain',
    'Upload speed',
    'Download speed',
    'Connection type',
    'Host',
    'Source IP',
    'Destination IP',
    'Process path',
    'Source GeoIP',
    'Destination ASN',
    'Inbound name',
    'Remote destination',
    'DNS mode',
    'Special rules'
  ]) {
    assert.match(detail, new RegExp(`tr\\('${field}'\\)`))
  }
})

test('Kokoro account options and default rules use clear desktop sections and save state', () => {
  const page = readFileSync(
    'src/renderer/src/components/profiles/kokoro-subscription-modal.tsx',
    'utf8'
  )
  const rules = readFileSync(
    'src/renderer/src/components/profiles/kokoro-default-rules.tsx',
    'utf8'
  )

  assert.match(page, /function KokoroOptionSection|const KokoroOptionSection/)
  assert.match(page, /title=\{tr\('Subscription options'\)\}/)
  assert.match(page, /title=\{tr\('Update behavior'\)\}/)
  assert.match(page, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/)
  assert.match(page, /radius="sm"/)
  assert.match(page, /footer=\{[\s\S]*tr\('Fetch and add'\)/)
  assert.match(page, /aria-label=\{tr\('Update rule sets automatically'\)\}/)
  assert.match(page, /aria-label=\{tr\('Update subscription automatically'\)\}/)
  assert.equal(page.match(/labelPlacement="inside"/g)?.length, 6)

  assert.match(rules, /<header className=/)
  assert.match(rules, /rev\. \{ruleSet\.revision\}/)
  assert.match(rules, /aria-label=\{tr\('Reload'\)\}/)
  assert.match(rules, /grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_auto\]/)
  assert.match(rules, /label=\{tr\('Rule type'\)\}/)
  assert.match(rules, /label=\{tr\('Rule target'\)\}/)
  assert.match(rules, /label=\{tr\('Rule content'\)\}/)
  assert.equal(rules.match(/labelPlacement="inside"/g)?.length, 3)
  assert.match(rules, /aria-label=\{tr\('Move up'\)\}/)
  assert.match(rules, /aria-label=\{tr\('Move down'\)\}/)
  assert.match(rules, /aria-label=\{tr\('Delete'\)\}/)
  assert.match(rules, /aria-live="polite"/)
  assert.match(rules, /tr\('Unsaved changes'\)/)
  assert.match(rules, /isDisabled=\{!isDirty \|\| Boolean\(validationError\)\}/)
  assert.match(rules, /variant="flat"[\s\S]*tr\('Add rule'\)/)
  assert.match(rules, /color="primary"[\s\S]*tr\('Save rules'\)/)
  assert.match(rules, /replaceKokoroDefaultRules\(ruleSet\.revision, rules\)/)
})

test('operational lists use compact hierarchy without changing their behavior', () => {
  const rulesPage = readFileSync('src/renderer/src/pages/rules.tsx', 'utf8')
  const ruleItem = readFileSync('src/renderer/src/components/rules/rule-item.tsx', 'utf8')
  const geoData = readFileSync('src/renderer/src/components/resources/geo-data.tsx', 'utf8')
  const ruleProvider = readFileSync(
    'src/renderer/src/components/resources/rule-provider.tsx',
    'utf8'
  )
  const overridesPage = readFileSync('src/renderer/src/pages/override.tsx', 'utf8')
  const overrideItem = readFileSync(
    'src/renderer/src/components/override/override-item.tsx',
    'utf8'
  )
  const logsPage = readFileSync('src/renderer/src/pages/logs.tsx', 'utf8')
  const logItem = readFileSync('src/renderer/src/components/logs/log-item.tsx', 'utf8')

  assert.match(rulesPage, /<Virtuoso/)
  assert.match(ruleItem, /<Card variant="secondary" className="w-full p-3">/)
  assert.match(ruleItem, /<Card\.Content className="w-full">/)
  assert.match(ruleItem, /hasHits \? 'bg-primary\/10 font-medium text-primary'/)
  assert.match(ruleItem, /aria-hidden="true"[\s\S]*→/)
  assert.match(ruleItem, /aria-label=\{`\$\{tr\('Enable rule'\)\}:/)
  assert.match(ruleItem, /mihomoRulesDisable/)

  assert.match(geoData, /title=\{tr\('Geo databases'\)\}/)
  assert.match(geoData, /max-w-\[40rem\]/)
  assert.match(geoData, /title=\{value\}/)
  assert.match(geoData, /mihomoUpgradeGeo\(\)/)
  assert.match(ruleProvider, /flex min-h-14 items-center gap-3 px-1 py-2/)
  assert.match(ruleProvider, /tr\('\{0\} rules', \[provider\.ruleCount\]\)/)
  assert.match(ruleProvider, /provider\.vehicleType\}::\{provider\.behavior/)
  assert.doesNotMatch(ruleProvider, /<Chip/)
  assert.match(ruleProvider, /mihomoUpdateRuleProviders/)

  assert.match(overridesPage, /m-2 grid grid-cols-2 gap-2/)
  assert.doesNotMatch(overridesPage, /lg:grid-cols-3|xl:grid-cols-4/)
  assert.match(overridesPage, /addOverrideItem/)
  assert.match(overrideItem, /<Card className="h-full w-full min-w-0 overflow-hidden">/)
  assert.match(overrideItem, /<Chip size="sm" variant="soft" color="accent">/)
  assert.match(overrideItem, /<KokoActionMenu/)
  assert.match(overrideItem, /onAction=\{onMenuAction\}/)

  assert.match(logsPage, /<Virtuoso/)
  assert.match(logsPage, /followOutput=\{trace\}/)
  assert.match(logsPage, /clearMihomoLogs\(\)/)
  assert.match(logsPage, /restartMihomoLogs\(\)/)
  assert.doesNotMatch(logItem, /<Card/)
  assert.match(logItem, /grid-cols-\[5\.25rem_4\.5rem_minmax\(0,1fr\)\]/)
  assert.match(logItem, /border-b border-divider\/70/)
  assert.match(logItem, /whitespace-pre-wrap break-words font-mono/)
})

test('log timestamps stay compact for today and retain the date across days', () => {
  const reference = new Date(2026, 8, 19, 12, 0, 0)

  assert.equal(
    formatLogTimestamp(new Date(2026, 8, 19, 3, 7, 55).toISOString(), reference),
    '03:07:55'
  )
  assert.equal(
    formatLogTimestamp(new Date(2026, 8, 18, 3, 7, 55).toISOString(), reference),
    '2026-09-18 03:07:55'
  )
  assert.equal(formatLogTimestamp('unparsed timestamp', reference), 'unparsed timestamp')
})

test('common settings choices use the shared segmented control', () => {
  const general = readFileSync('src/renderer/src/components/settings/general-config.tsx', 'utf8')
  const controls = readFileSync('src/renderer/src/components/base/base-controls.tsx', 'utf8')

  assert.match(controls, /export const SettingTabs/)
  assert.match(general, /ariaLabel=\{tr\('Notification style'\)\}/)
  assert.match(general, /ariaLabel=\{tr\('Update channel'\)\}/)
  assert.doesNotMatch(general, /<Tabs/)
})

test('core settings separate runtime, service and environment concerns', () => {
  const registry = readFileSync(
    'src/renderer/src/components/settings/settings-registry.tsx',
    'utf8'
  )
  const runtime = readFileSync(
    'src/renderer/src/components/settings/core-runtime-config.tsx',
    'utf8'
  )

  assert.match(registry, /const corePanels:/)
  assert.match(registry, /key: 'runtime'/)
  assert.match(registry, /content: \(\) => <CoreExecutionSettings \/>/)
  assert.match(registry, /key: 'service'/)
  assert.match(registry, /content: \(\) => <ServiceManagementSettings \/>/)
  assert.match(registry, /key: 'environment'/)
  assert.match(registry, /content: \(\) => <EnvSetting \/>/)
  assert.match(registry, /entries: corePanels\.flatMap/)
  assert.match(registry, /panels: corePanels/)
  assert.match(runtime, /sections\.includes\('runtime'\)/)
  assert.match(runtime, /sections\.includes\('service'\)/)
})

test('data settings separate subscriptions, backups and developer integrations', () => {
  const registry = readFileSync(
    'src/renderer/src/components/settings/settings-registry.tsx',
    'utf8'
  )
  const integrations = readFileSync(
    'src/renderer/src/components/settings/subscription-integration-settings.tsx',
    'utf8'
  )

  assert.match(registry, /const dataPanels:/)
  assert.match(registry, /key: 'subscriptions'/)
  assert.match(registry, /content: \(\) => <SubscriptionDataSettings \/>/)
  assert.match(registry, /key: 'backup'/)
  assert.match(registry, /content: \(\) => <WebdavConfig \/>/)
  assert.match(registry, /key: 'integrations'/)
  assert.match(registry, /<GistIntegrationSettings \/>/)
  assert.match(registry, /entries: dataPanels\.flatMap/)
  assert.match(registry, /panels: dataPanels/)
  assert.match(integrations, /hasSubscriptionSection = sections\.includes\('subscription'\)/)
  assert.match(integrations, /hasGistSection = sections\.includes\('gist'\)/)
})

test('diagnostics settings separate logs, maintenance and lifecycle actions', () => {
  const registry = readFileSync(
    'src/renderer/src/components/settings/settings-registry.tsx',
    'utf8'
  )
  const actions = readFileSync('src/renderer/src/components/settings/actions.tsx', 'utf8')

  assert.match(registry, /const diagnosticsPanels:/)
  assert.match(registry, /key: 'logs'/)
  assert.match(registry, /content: \(\) => <LogSetting \/>/)
  assert.match(registry, /key: 'maintenance'/)
  assert.match(registry, /<Actions sections=\{\['application', 'diagnostics'\]\} \/>/)
  assert.match(registry, /key: 'lifecycle'/)
  assert.match(registry, /<Actions sections=\{\['version', 'danger'\]\} \/>/)
  assert.match(registry, /entries: diagnosticsPanels\.flatMap/)
  assert.match(registry, /panels: diagnosticsPanels/)
  assert.match(actions, /export type ActionSection/)
  assert.match(actions, /sections\.includes\('application'\)/)
  assert.match(actions, /sections\.includes\('diagnostics'\)/)
  assert.match(actions, /sections\.includes\('version'\)/)
  assert.match(actions, /sections\.includes\('danger'\)/)
})
