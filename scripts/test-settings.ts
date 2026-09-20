import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { mergeSettingsPatch } from '../src/renderer/src/utils/merge-settings-patch.ts'
import {
  accountKeys,
  groupForSiderKey,
  navigationKeys,
  normalizeSiderOrder
} from '../src/renderer/src/components/sider/sider-order.ts'
import { normalizeCoreVersion } from '../src/renderer/src/components/sider/core-version.ts'
import {
  formatLogTimestamp,
  parseLogMessage
} from '../src/renderer/src/components/logs/log-display.ts'
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

test('application settings keep one clear navigation hierarchy in compact desktop windows', () => {
  const settings = readFileSync('src/renderer/src/pages/settings.tsx', 'utf8')
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')
  const settingCard = readFileSync('src/renderer/src/components/base/base-setting-card.tsx', 'utf8')
  const logSetting = readFileSync('src/renderer/src/components/mihomo/log-setting.tsx', 'utf8')
  const kokoForm = readFileSync('src/renderer/src/components/base/koko-form.tsx', 'utf8')
  const searchField = readFileSync(
    'src/renderer/src/components/base/koko-search-field.tsx',
    'utf8'
  )
  const general = readFileSync('src/renderer/src/components/settings/general-config.tsx', 'utf8')

  assert.match(settings, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(settings, /event\.key\.toLowerCase\(\) === 'f'/)
  assert.match(settings, /const \[searchExpanded, setSearchExpanded\] = useState\(false\)/)
  assert.match(settings, /const openSearch = useCallback/)
  assert.match(settings, /searchInputRef\.current\?\.focus\(\)/)
  assert.match(settings, /event\.key === 'Escape'/)
  assert.match(
    settings,
    /settings-context-header sticky top-0 z-10 w-full border-b border-divider bg-background\/95/
  )
  assert.match(
    settings,
    /settings-context-inner mx-auto w-full max-w-\[960px\] px-4/
  )
  assert.match(
    settings,
    /settings-content-inner mx-auto w-full max-w-\[960px\] px-4/
  )
  assert.match(settings, /<main className="min-w-0 pb-4">/)
  assert.match(settings, /scrollTo\(\{ top: 0, left: 0 \}\)/)
  assert.equal(settings.match(/setSearchParams\(nextParams\)\s*resetContentScroll\(\)/g)?.length, 2)
  assert.match(settings, /settings-navigation-list/)
  assert.match(settings, /settings-navigation-search/)
  assert.match(settings, /<ScrollShadow/)
  assert.match(settings, /orientation="horizontal"/)
  assert.doesNotMatch(settings, /activeCategory\.scrollIntoView/)
  assert.match(settings, /const itemStart = activeCategory\.offsetLeft/)
  assert.match(settings, /const itemEnd = itemStart \+ activeCategory\.offsetWidth/)
  assert.match(settings, /const visibleStart = navigation\.scrollLeft/)
  assert.match(settings, /const visibleEnd = visibleStart \+ navigation\.clientWidth/)
  assert.match(settings, /navigation\.scrollTo\(\{ left: itemStart \}\)/)
  assert.match(settings, /navigation\.scrollTo\(\{ left: itemEnd - navigation\.clientWidth \}\)/)
  assert.match(settings, /<KokoTabs/)
  assert.match(settings, /variant="secondary"/)
  assert.match(settings, /density="toolbar"/)
  assert.match(settings, /className="app-nodrag w-max max-w-none"/)
  assert.doesNotMatch(
    settings,
    /settings-panel-navigation[^"\n]*overflow-x-auto[^"\n]*px-3/
  )
  assert.match(settings, /onChange=\{selectPanel\}/)
  assert.match(settings, /\{\(normalizedSearch \|\| selectedPanels\.length > 1\) && \(/)
  assert.match(settings, /\{normalizedSearch \? \([\s\S]*?<h1[\s\S]*?tr\('Search settings'\)/)
  assert.doesNotMatch(settings, /<h1[^>]*>[\s\S]*?selectedPanel\?\.label[\s\S]*?<\/h1>/)
  assert.doesNotMatch(settings, /selectedPanel\?\.label \?\? selected\.label/)
  assert.match(settings, /nextParams\.set\('panel', panelKey\)/)
  assert.doesNotMatch(settings, /settings-panel-button/)
  assert.match(settings, /settings-container min-h-full/)
  assert.match(settings, /contentClassName="overflow-x-clip"/)
  assert.match(settings, /max-w-\[960px\]/)
  assert.match(settings, /entry\.fallbackLabel/)
  assert.match(settings, /panelLabel/)
  assert.match(settings, /item\.panels\?\.find\(\(panel\) => panel\.key === entry\.panel\)/)
  assert.match(
    styles,
    /\.settings-container \{[\s\S]*overflow-x: clip;[\s\S]*container-type: inline-size/
  )
  assert.match(styles, /\.settings-layout \{[\s\S]*width: 100%;[\s\S]*min-width: 0;/)
  assert.match(styles, /@container settings \(max-width: 50rem\)/)
  assert.doesNotMatch(styles, /@media \(max-width: 1050px\)/)
  assert.match(styles, /\.settings-navigation-list \{[\s\S]*flex-direction: row/)
  assert.match(styles, /\.settings-navigation-list \{[\s\S]*overflow-x: auto/)
  assert.match(settings, /settings-panel-navigation[^"\n]*overflow-x-auto/)
  assert.match(styles, /\.settings-navigation-search \{[\s\S]*flex: 0 0 auto;[\s\S]*width: auto;/)
  assert.doesNotMatch(styles, /clamp\(10rem, 30cqi, 15rem\)/)
  assert.match(styles, /\.settings-navigation-search-field \{[\s\S]*width: 12rem;/)
  assert.match(styles, /\.settings-navigation-list::-webkit-scrollbar/)
  assert.doesNotMatch(styles, /\.settings-content-search\s*\{[\s\S]*display:\s*block/)
  assert.doesNotMatch(styles, /\.settings-panel-button/)
  assert.doesNotMatch(styles, /\.settings-category-label \{[\s\S]*display: none/)
  assert.match(settings, /<KokoSearchField/)
  assert.match(settings, /searchExpanded \|\| normalizedSearch/)
  assert.match(settings, /settings-search-trigger[\s\S]*aria-label=\{tr\('Search settings'\)\}/)
  assert.match(settings, /<LuSearch aria-hidden="true"/)
  assert.match(settings, /onBlur=\{\(event\) => \{[\s\S]*setSearchExpanded\(false\)/)
  assert.doesNotMatch(settings, /<KokoTextField/)
  assert.match(searchField, /<InputGroup/)
  assert.match(searchField, /inputRef\?: React\.Ref<HTMLInputElement>/)
  assert.match(searchField, /ref=\{inputRef\}/)
  assert.match(searchField, /variant="secondary"/)
  assert.match(searchField, /h-9 min-h-9/)
  assert.match(searchField, /className="h-9 py-0"/)
  assert.match(searchField, /aria-label=\{tr\('Clear field'\)\}/)
  assert.match(settingCard, /settings-section__heading/)
  assert.match(settingCard, /text-base font-semibold leading-6 text-foreground/)
  assert.match(settingCard, /settings-section__content border-t border-divider/)
  assert.doesNotMatch(settingCard, /settings-section__content border-y/)
  assert.match(logSetting, /<SettingCard>/)
  assert.doesNotMatch(logSetting, /<SettingCard header=\{tr\('Application logs'\)\}>/)
  assert.doesNotMatch(logSetting, /className="w-25"/)
  assert.equal(logSetting.match(/controlWidth="number"/g)?.length, 3)
  assert.match(logSetting, /endContent=\{tr\('days'\)\}/)
  assert.match(logSetting, /endContent="MB"/)
  assert.match(logSetting, /endContent=\{tr\('entries'\)\}/)
  assert.match(kokoForm, /<InputGroup\.Suffix[^>]*>[\s\S]*\{endContent\}/)
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
    assert.match(source, /from '@heroui\/react'/)
    assert.doesNotMatch(source, /@heroui-v3/)
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
  assert.match(listEditor, /<Button/)
  assert.match(listEditor, /aria-label=\{tr\('Delete'\)\}/)
  assert.match(listEditor, /variant="ghost"/)
  assert.doesNotMatch(listEditor, /variant="danger-soft"/)
  assert.match(interfaceSelect, /<Select\.Trigger/)
  assert.match(interfaceSelect, /<ListBox\.Item/)
})

test('SettingItem has one canonical layout without legacy compatibility paths', () => {
  const settingItem = readFileSync('src/renderer/src/components/base/base-setting-item.tsx', 'utf8')
  const featureLayout = readFileSync(
    'src/renderer/src/components/base/base-feature-settings.tsx',
    'utf8'
  )
  const settingsPage = readFileSync('src/renderer/src/pages/settings.tsx', 'utf8')
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')

  for (const file of collectTsxFiles('src/renderer/src')) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /compatKey=["']legacy["']/, file)
  }

  assert.doesNotMatch(settingItem, /compatKey|SettingItemLegacyContext|useContext/)
  assert.doesNotMatch(featureLayout, /SettingItemModeProvider/)
  assert.doesNotMatch(settingsPage, /SettingItemModeProvider/)
  assert.doesNotMatch(styles, /setting-item-legacy/)
  assert.equal(settingItem.match(/setting-item select-text/g)?.length, 1)
  assert.match(settingItem, /data-setting-label=\{searchableLabel\}/)
  assert.match(settingItem, /setting-item__description/)
  assert.match(settingItem, /\{actions\}/)
  assert.match(styles, /:root:lang\(en\) \.setting-item:not\(\.setting-item--titleless\)/)
  assert.match(styles, /:root:lang\(en\) \.setting-item__title[\s\S]*overflow-wrap: anywhere/)
})

test('system proxy keeps bypass inspection on the page and editing in the modal', () => {
  const proxy = readFileSync(
    'src/renderer/src/components/settings/network/system-proxy-settings.tsx',
    'utf8'
  )

  assert.match(proxy, /description=\{tr\('Leave empty to use 127\.0\.0\.1'\)\}/)
  assert.match(proxy, /controlWidth="short"/)
  assert.match(proxy, /placeholder="127\.0\.0\.1"/)
  assert.doesNotMatch(
    proxy,
    /placeholder=\{tr\('Default: 127\.0\.0\.1\. Change only if needed'\)\}/
  )
  assert.doesNotMatch(proxy, /import EditableList|<EditableList/)
  assert.match(proxy, /const bypassPreviewLimit = 5/)
  assert.match(proxy, /items\.slice\(0, bypassPreviewLimit\)/)
  assert.match(proxy, /data-bypass-preview/)
  assert.match(proxy, /<code[\s\S]*title=\{item\}[\s\S]*>\s*\{item\}\s*<\/code>/)
  assert.match(proxy, /tr\('\+ \{0\} more', \[remaining\]\)/)
  assert.match(proxy, /tr\('\{0\} items', \[values\.bypass\.length\]\)/)
  assert.match(proxy, /tr\('Add defaults'\)/)
  assert.match(proxy, /Array\.from\(new Set\(\[\.\.\.defaultBypass, \.\.\.values\.bypass\]\)\)/)
  assert.match(proxy, /<ByPassEditorModal[\s\S]*bypass: list/)
  assert.match(proxy, /onPress=\{\(\) => setOpenEditor\(true\)\}/)
  assert.match(proxy, /const setValues = \(v: typeof values\): void => \{[\s\S]*setChanged\(true\)/)
})

test('settings and Mihomo forms share the KokoroBox HeroUI v3 conventions', () => {
  const form = readFileSync('src/renderer/src/components/base/koko-form.tsx', 'utf8')
  const controls = readFileSync('src/renderer/src/components/base/base-controls.tsx', 'utf8')
  const segmentedControl = controls.slice(controls.indexOf('export const KokoSegmentedControl'))
  const systemProxy = readFileSync(
    'src/renderer/src/components/settings/network/system-proxy-settings.tsx',
    'utf8'
  )
  const migratedFiles = [
    ...collectTsxFiles('src/renderer/src/components/settings'),
    ...collectTsxFiles('src/renderer/src/components/mihomo'),
    ...collectTsxFiles('src/renderer/src/components/dns')
  ]

  for (const file of migratedFiles) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /@heroui-v3/)
  }

  assert.match(form, /export const KokoTextField/)
  assert.match(form, /export type KokoControlWidth = 'number' \| 'short' \| 'select' \| 'url' \| 'full'/)
  assert.match(form, /number: 'w-32 max-w-full'/)
  assert.match(form, /short: 'w-full max-w-72'/)
  assert.match(form, /select: 'w-56 max-w-full'/)
  assert.match(form, /url: 'w-full max-w-120'/)
  assert.match(form, /controlWidth\?: KokoControlWidth/)
  assert.match(form, /<InputGroup\.Input/)
  assert.match(form, /export const KokoSelect/)
  assert.match(form, /<Select\.Trigger/)
  assert.match(form, /<Select\.Value className=/)
  assert.match(form, /selectedText/)
  assert.match(form, /density\?: 'normal' \| 'compact' \| 'toolbar'/)
  assert.match(form, /density = 'normal'/)
  assert.match(form, /valueClassName\?: string/)
  assert.match(form, /<Select\.Value className=\{cn\('min-w-0 truncate', valueClassName\)\}>/)
  assert.match(form, /variant\?: SelectProps<object>\['variant'\]/)
  assert.match(form, /variant = 'primary'/)
  assert.match(form, /variant=\{variant\}/)
  assert.match(form, /density === 'compact'/)
  assert.match(form, /h-8 min-h-8 items-center py-0/)
  assert.match(form, /h-9 min-h-9 items-center py-0/)
  assert.match(form, /min-h-8 px-2 py-1/)
  assert.doesNotMatch(form, /koko-select__popover|shadow-overlay/)
  assert.doesNotMatch(form, /min-h-8 px-2\.5 py-1\.5/)
  assert.match(form, /labelPlacement\?: 'inside' \| 'outside'/)
  assert.match(form, /<Select\.Indicator \/>/)
  assert.match(form, /<Select\.Popover/)
  assert.match(form, /<ListBox\.Item/)
  assert.doesNotMatch(form, /KokoButton|KokoSwitch|KokoTooltip|resolveKokoButtonVariant/)
  assert.match(systemProxy, /<Switch\.Content>/)
  assert.match(systemProxy, /<Switch\.Control>/)
  assert.match(systemProxy, /<Switch\.Thumb \/>/)
  assert.match(systemProxy, /controlWidth="short"/)
  assert.match(controls, /export const KokoSegmentedControl/)
  assert.match(controls, /export interface KokoSegmentedOption/)
  assert.match(controls, /icon\?: React\.ReactNode/)
  assert.match(segmentedControl, /<ToggleButtonGroup/)
  assert.match(segmentedControl, /selectionMode="single"/)
  assert.match(segmentedControl, /disallowEmptySelection/)
  assert.match(segmentedControl, /selectedKeys=\{new Set\(\[selectedKey\]\)\}/)
  assert.match(segmentedControl, /<ToggleButton[\s\S]*id=\{option\.id\}/)
  assert.match(segmentedControl, /isDisabled=\{option\.isDisabled\}/)
  assert.match(segmentedControl, /<ToggleButtonGroup\.Separator \/>/)
  assert.match(segmentedControl, /\{option\.icon\}/)
  assert.match(segmentedControl, /min-w-16 shrink-0 whitespace-nowrap/)
  assert.doesNotMatch(segmentedControl, /<Tabs(?:\.|\s)/)
  assert.doesNotMatch(controls, /export const SettingTabs/)
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

  for (const file of rendererFiles) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(
      source,
      /<Dropdown\.Trigger\b[\s\S]*?>\s*<Button\b/,
      `${file} nests a button inside the React Aria dropdown trigger`
    )
    assert.doesNotMatch(source, /@heroui-v3/)
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
  assert.match(menus, /<Dropdown\.Section>/)
  assert.match(menus, /<Label className="block truncate">\{item\.label\}<\/Label>/)
  assert.match(
    menus,
    /<Description className="block truncate">\{item\.description\}<\/Description>/
  )
  assert.match(menus, /variant=\{item\.tone === 'danger' \? 'danger' : 'default'\}/)
  assert.match(menus, /changesDangerGroup/)
  assert.match(menus, /if \(currentSection\.length > 0\) sections\.push\(currentSection\)/)
  assert.match(menus, /\{sectionIndex > 0 \? <Separator \/> : null\}/)
  assert.equal(menus.match(/<Separator \/>/g)?.length, 1)
  assert.doesNotMatch(menus, /border-b border-divider/)
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
  assert.match(tabs, /density\?: 'normal' \| 'toolbar'/)
  assert.match(tabs, /density = 'normal'/)
  assert.match(tabs, /onSelectionChange=\{\(key\) => void onChange\(String\(key\)\)\}/)
  assert.match(tabs, /<Tabs\.Tab[\s\S]*id=\{option\.id\}/)
  assert.match(tabs, /'min-w-max whitespace-nowrap'/)
  assert.match(tabs, /density === 'toolbar' && 'h-9 px-2\.5'/)
  assert.equal(
    tabs.match(/density === 'toolbar' \? 'h-9 w-max max-w-none' : 'max-w-full'/g)?.length,
    2
  )
  assert.match(tabs, /density === 'toolbar' && 'h-9 w-max'/)
  assert.match(connections, /<KokoTabs[\s\S]*variant="secondary"/)
  assert.match(connections, /<KokoTabs[\s\S]*density="toolbar"/)
  assert.equal(connections.match(/whitespace-nowrap">/g)?.length, 2)
  assert.match(connections, /data-slot="connection-count"/)
  assert.doesNotMatch(connections, /bg-danger\/12 text-danger/)
  assert.doesNotMatch(connections, /\bBadge\b/)
  assert.match(profiles, /buttonClassName="[^"]*h-8[^"]*w-8[^"]*min-w-8/)
  assert.match(profiles, /buttonVariant="secondary"/)
  assert.doesNotMatch(profiles, /buttonColor=/)
  assert.match(profileItem, /buttonClassName="[^"]*h-8[^"]*w-8[^"]*min-w-8/)
  assert.match(profileItem, /items=\{menuItems\}/)
  assert.match(
    profileItem,
    /id: 'delete'[\s\S]*startContent: <MdDeleteOutline \/>[\s\S]*tone: 'danger'/
  )
  assert.match(profileItem, /startContent: <MdEdit \/>/)
  assert.match(profileItem, /startContent: <MdEditDocument \/>/)
  assert.match(profileItem, /startContent: <MdOpenInNew \/>/)
  assert.match(profileItem, /startContent: <MdQrCode2 \/>/)
  assert.match(profileItem, /startContent: <MdHome \/>/)
  assert.doesNotMatch(profileItem, /showDivider|className: 'text-danger'/)
  assert.match(tray, /<Accordion[\s\S]*allowsMultipleExpanded/)
  assert.match(tray, /<Accordion\.Item[\s\S]*id=\{group\.name\}/)
  assert.match(tray, /<Accordion\.Trigger/)
  assert.match(tray, /<Accordion\.Panel>/)
  assert.match(groupModal, /<Modal\.Backdrop\b/)
  assert.match(groupModal, /<Modal\.Container>/)
  assert.match(groupModal, /<Modal\.Dialog\b/)
  assert.match(groupModal, /<Modal\.Heading>/)
})

test('renderer components use the canonical HeroUI v3 package', () => {
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
    assert.doesNotMatch(source, /@heroui-v3/, `${file} still imports the migration alias`)
  }

  for (const file of migrationPriorityFiles) {
    assert.match(readFileSync(file, 'utf8'), /from '@heroui\/react'/)
  }
})

test('service management separates maintenance, danger and state-specific actions', () => {
  const serviceModal = readFileSync(
    'src/renderer/src/components/mihomo/service-modal.tsx',
    'utf8'
  )
  const footer = serviceModal.slice(
    serviceModal.indexOf('<Modal.Footer'),
    serviceModal.indexOf('</Modal.Footer>')
  )

  assert.match(serviceModal, /type ServiceAction =/)
  assert.match(serviceModal, /useState<ServiceAction \| null>\(null\)/)
  assert.doesNotMatch(serviceModal, /const \[loading, setLoading\]/)
  assert.match(serviceModal, /aria-labelledby="service-maintenance-heading"/)
  assert.match(serviceModal, /aria-labelledby="service-danger-heading"/)
  assert.ok(
    serviceModal.indexOf('service-maintenance-heading') < serviceModal.indexOf('<Modal.Footer')
  )
  assert.ok(serviceModal.indexOf('service-danger-heading') < serviceModal.indexOf('<Modal.Footer'))
  assert.doesNotMatch(footer, /Initialize again|Restart|Repair service|Uninstall/)
  assert.equal((footer.match(/tr\('Close'\)/g) || []).length, 1)
  assert.match(footer, /status === 'not-installed'/)
  assert.match(footer, /status === 'need-init'/)
  assert.match(footer, /status === 'stopped'/)
  assert.match(footer, /status === 'paused'/)
  assert.match(footer, /status === 'requires-approval'/)
  assert.match(serviceModal, /isPending=\{activeAction === 'restart'\}/)
  assert.match(serviceModal, /isPending=\{activeAction === 'repair'\}/)
  assert.match(serviceModal, /isPending=\{activeAction === 'uninstall'\}/)
  assert.match(serviceModal, /isDisabled=\{isBusy\}/)
  assert.match(serviceModal, /while \(retries > 0/)
  assert.match(serviceModal, /await refreshServiceStatus\(result\)/)
  assert.match(serviceModal, /<Modal\.CloseTrigger className="app-nodrag" \/>/)
})

test('migrated HeroUI v3 cards preserve layout safety without requiring v2 spacing', () => {
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
    ['connection', connection],
    ['connection group', connectionGroup]
  ] as const) {
    const classes = cardClassName(source, label).split(/\s+/)
    assert.ok(classes.includes('overflow-hidden'), `${label} Card must contain its content`)
    assert.ok(classes.includes('min-w-0'), `${label} Card must be allowed to shrink`)
  }

  assert.match(connection, /<Card\.Header className="[^"]*\bflex-row\b/)
  assert.match(profile, /className="col-span-1 grid min-w-0 touch-sortable-card"/)
  assert.match(profile, /<CollectionCard isBusy=\{selecting\} isCurrent=\{isCurrent\}>/)
  assert.match(profile, /<Card\.Content className="[^"]*\bpx-3\b/)
  assert.match(profile, /<Card\.Footer className="[^"]*\bpx-3\b/)
  assert.match(profilesPage, /<CollectionGrid>/)
  assert.doesNotMatch(profilesPage, /sm:grid-cols-2|lg:grid-cols-3|xl:grid-cols-4/)
})

test('profile and override pages share the collection management layout contract', () => {
  const toolbar = readFileSync(
    'src/renderer/src/components/base/management/collection-toolbar.tsx',
    'utf8'
  )
  const surface = readFileSync(
    'src/renderer/src/components/base/management/collection-surface.tsx',
    'utf8'
  )
  const profiles = readFileSync('src/renderer/src/pages/profiles.tsx', 'utf8')
  const overrides = readFileSync('src/renderer/src/pages/override.tsx', 'utf8')
  const profileItem = readFileSync('src/renderer/src/components/profiles/profile-item.tsx', 'utf8')
  const overrideItem = readFileSync(
    'src/renderer/src/components/override/override-item.tsx',
    'utf8'
  )

  assert.match(toolbar, /export default CollectionImportToolbar/)
  assert.match(toolbar, /variant="primary"/)
  assert.match(toolbar, /tr\('Paste'\)/)
  assert.match(surface, /repeat\(auto-fit,minmax\(min\(20rem,100%\),1fr\)\)/)
  assert.doesNotMatch(surface, /repeat\(auto-fill/)
  assert.doesNotMatch(surface, /minmax\(min\(20rem,100%\),24rem\)/)
  assert.doesNotMatch(surface, /justify-start/)
  assert.match(surface, /export const CollectionCard/)
  assert.match(surface, /border-accent\/55 bg-accent-soft\/35/)
  assert.match(surface, /export const CollectionDropZone/)
  assert.match(surface, /export const CollectionEmptyState/)
  assert.match(surface, /className="col-span-full [^"]*"/)

  for (const page of [profiles, overrides]) {
    assert.match(page, /<CollectionImportToolbar/)
    assert.match(page, /<CollectionDropZone active=\{fileOver\}/)
    assert.match(page, /<CollectionGrid>/)
    assert.match(page, /<CollectionEmptyState/)
    assert.doesNotMatch(page, /grid-cols-2|repeat\(auto-fit/)
  }

  assert.match(profileItem, /<CollectionCard isBusy=\{selecting\} isCurrent=\{isCurrent\}>/)
  assert.match(profileItem, /className="[^"]*\bmin-w-0\b[^"]*touch-sortable-card[^"]*"/)
  assert.doesNotMatch(profileItem, /touch-sortable-card[^"\n]*(?:max-w-|justify-self-start)/)
  assert.match(profileItem, /tr\('Current'\)/)
  assert.doesNotMatch(profileItem, /bg-primary|text-primary-foreground/)
  assert.match(overrideItem, /<CollectionCard/)
  assert.match(overrideItem, /className="[^"]*\bmin-w-0\b[^"]*touch-sortable-card[^"]*"/)
  assert.doesNotMatch(overrideItem, /touch-sortable-card[^"\n]*(?:max-w-|justify-self-start)/)
  assert.match(overrideItem, /info\.type === 'remote' \? tr\('Remote'\) : tr\('Local'\)/)
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
    assert.match(source, /from '@heroui\/react'/, `${file} does not import HeroUI v3`)
    assert.doesNotMatch(source, /@heroui-v3/)
    assert.doesNotMatch(source, /CardBody|isPressable|shadow="(?:none|sm)"/)
  }

  const rule = readFileSync('src/renderer/src/components/rules/rule-item.tsx', 'utf8')
  const proxy = readFileSync('src/renderer/src/components/proxies/proxy-item.tsx', 'utf8')
  const override = readFileSync('src/renderer/src/components/override/override-item.tsx', 'utf8')
  const appRule = readFileSync('src/renderer/src/components/app-routing/rule-row.tsx', 'utf8')

  assert.match(rule, /<Card className="rule-list-card" data-enabled=\{isEnabled\}>/)
  assert.match(rule, /<Card\.Content/)
  assert.match(proxy, /<Card[\s\S]*variant="secondary"/)
  assert.match(proxy, /<button[\s\S]*aria-pressed=\{selected\}[\s\S]*onClick=\{selectProxy\}/)
  assert.match(override, /<CollectionCard/)
  assert.match(override, /<button[\s\S]*disabled=\{disableOpen\}/)
  assert.match(appRule, /<Card className="app-routing-rule-card p-3" data-enabled={rule\.enabled}>/)
  assert.doesNotMatch(appRule, /<Card variant="secondary"/)
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
  assert.equal((appRouting.match(/<KokoSelect/g) || []).length, 2)
  assert.equal((appRouting.match(/controlWidth="select"/g) || []).length, 2)
  assert.equal((appRouting.match(/density="compact"/g) || []).length, 2)
  assert.equal((appRouting.match(/disallowEmptySelection/g) || []).length, 2)
  assert.doesNotMatch(appRouting, /<Select(?:\.|\s)|<ListBox(?:\.|\s)/)
})

test('desktop sidebar separates controls, live status and navigation', () => {
  const sider = readFileSync('src/renderer/src/components/sider/sider-cards.tsx', 'utf8')
  const siderOrderSource = readFileSync(
    'src/renderer/src/components/sider/sider-order.ts',
    'utf8'
  )
  const surfaces = readFileSync('src/renderer/src/components/sider/sider-surfaces.tsx', 'utf8')
  const appOverrides = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')
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
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  const updater = readFileSync('src/renderer/src/components/updater/updater-button.tsx', 'utf8')
  const navItem = surfaces.slice(
    surfaces.indexOf('export const SiderNavItem'),
    surfaces.indexOf('export const SiderStatusCard')
  )
  const statusCard = surfaces.slice(
    surfaces.indexOf('export const SiderStatusCard'),
    surfaces.indexOf('interface SiderQuickControlProps')
  )
  const quickControl = surfaces.slice(surfaces.indexOf('export const SiderQuickControl'))
  const iconButton = surfaces.slice(
    surfaces.indexOf('export const SiderIconButton'),
    surfaces.indexOf('export const SiderIconGroup')
  )
  const quickControlStyles = appOverrides.slice(
    appOverrides.indexOf('.sider-quick-control-container'),
    appOverrides.indexOf('.setting-item')
  )

  for (const file of readdirSync('src/renderer/src/components/sider').filter((name) =>
    name.endsWith('.tsx')
  )) {
    const source = readFileSync(`src/renderer/src/components/sider/${file}`, 'utf8')
    assert.doesNotMatch(source, /@heroui-v3/, `${file} still imports the migration alias`)
  }

  assert.match(sider, /SiderSection title=\{tr\('Quick controls'\)\} columns=\{2\}/)
  assert.match(sider, /SiderSection title=\{tr\('Current status'\)\}/)
  assert.match(sider, /SiderSection title=\{tr\('Navigation'\)\}/)
  const quickSectionPosition = sider.indexOf("SiderSection title={tr('Quick controls')}")
  const accountEntryPosition = sider.indexOf('className="sider-account-entry"')
  const statusSectionPosition = sider.indexOf("SiderSection title={tr('Current status')}")
  const navigationSectionPosition = sider.indexOf("SiderSection title={tr('Navigation')}")
  assert.ok(quickSectionPosition < accountEntryPosition)
  assert.ok(accountEntryPosition < statusSectionPosition)
  assert.ok(statusSectionPosition < navigationSectionPosition)
  assert.match(sider, /groupForSiderKey\(String\(active\.id\)\)/)
  assert.match(sider, /const configuredOrder = useMemo/)
  assert.doesNotMatch(sider, /const configuredOrder = normalizeSiderOrder/)
  assert.match(sider, /orderedKeys\(quickControlKeys\)/)
  assert.match(sider, /orderedKeys\(currentStatusKeys\)/)
  assert.match(sider, /orderedKeys\(navigationKeys\)/)
  assert.match(
    sider,
    /renderCards\(quickControlKeys\)[\s\S]*renderCards\(accountKeys\)[\s\S]*renderCards\(currentStatusKeys\)[\s\S]*renderCards\(navigationKeys\)/
  )
  assert.equal(sider.match(/<SiderIconGroup/g)?.length, 4)
  assert.match(sider, /<SiderIconGroup label=\{tr\('Quick controls'\)\}>/)
  assert.match(sider, /<SiderIconGroup label="Kokoro" separated>/)
  assert.match(sider, /<SiderIconGroup label=\{tr\('Current status'\)\} separated>/)
  assert.match(sider, /<SiderIconGroup label=\{tr\('Navigation'\)\} separated>/)
  assert.match(sider, /isAccountVisible && \([\s\S]*renderCards\(accountKeys\)/)
  assert.doesNotMatch(sider, /SortableContext items=\{orderedKeys\(accountKeys\)\}/)
  assert.match(
    siderOrderSource,
    /export type SiderGroup = 'quick' \| 'account' \| 'status' \| 'navigation'/
  )
  assert.match(surfaces, /export const SiderQuickControl/)
  assert.match(surfaces, /export const SiderNavItem/)
  assert.match(surfaces, /export const SiderStatusRow/)
  assert.match(surfaces, /export const SiderStatusCard/)
  assert.match(surfaces, /export const SiderIconButton/)
  assert.match(surfaces, /export const SiderIconGroup/)
  assert.match(surfaces, /data-sider-icon-group/)
  assert.match(surfaces, /border-t border-separator\/60/)
  assert.match(
    iconButton,
    /className=\{cn\('app-nodrag', className, active && siderActiveIconButtonClassName\)\}/
  )
  assert.match(iconButton, /variant=\{active \? 'secondary' : variant\}/)
  assert.match(surfaces, /const SiderItemIcon/)
  assert.match(surfaces, /const SiderItemContent/)
  assert.match(surfaces, /const SiderTrailingSlot/)
  assert.match(surfaces, /siderItemTitleClassName[\s\S]*h-5[\s\S]*font-semibold leading-5/)
  assert.match(surfaces, /siderItemSubtitleClassName[\s\S]*h-4[\s\S]*leading-4/)
  assert.match(surfaces, /h-\[2\.375rem\][\s\S]*flex-col[\s\S]*gap-0\.5/)
  assert.match(surfaces, /data-sider-text-stack/)
  assert.match(surfaces, /data-status-tone=\{tone\}/)
  assert.match(surfaces, /inline-flex h-4 min-w-0 items-center gap-1\.5/)
  assert.match(surfaces, /size-1\.5 shrink-0 rounded-full/)
  assert.match(surfaces, /<SiderStatusRow className="shrink-0" tone=\{statusTone\}>/)
  assert.match(surfaces, /grid-cols-\[2rem_minmax\(0,1fr\)_2rem\]/)
  assert.match(surfaces, /size-8 shrink-0 items-center justify-center/)
  assert.match(surfaces, /min-w-8 shrink-0 items-center justify-center/)
  assert.equal(surfaces.match(/<SiderItemContent/g)?.length, 2)
  assert.match(surfaces, /<Tooltip\.Content placement=\{placement\}>/)
  assert.match(surfaces, /metadataSeparator = '·'/)
  assert.match(surfaces, /showChevron \?\? !actions/)
  assert.match(surfaces, /prioritizeDescription \? 'min-w-0 truncate' : 'shrink-0'/)
  assert.match(surfaces, /columns === 2 \? 'grid grid-cols-2 gap-1\.5' : 'flex flex-col gap-1\.5'/)
  assert.match(surfaces, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(surfaces, /navigationStatusIndicatorClasses/)
  assert.match(surfaces, /success: 'bg-success'/)
  assert.match(surfaces, /warning: 'bg-warning'/)
  assert.match(surfaces, /danger: 'bg-danger'/)
  assert.doesNotMatch(surfaces, /bg-(?:success|warning|danger)-500/)
  assert.match(surfaces, /navigationStatusTextClasses\[tone\]/)
  assert.match(
    surfaces,
    /const navigationStatusTextClasses[\s\S]*success: 'text-foreground-500'[\s\S]*warning: 'text-warning'[\s\S]*danger: 'text-danger'/
  )
  assert.match(navItem, /border-separator\/60 bg-surface\/55/)
  assert.match(navItem, /hover:border-accent\/25 hover:bg-surface-secondary\/70 hover:shadow-sm/)
  assert.match(navItem, /active\s*\? siderActiveSurfaceClassName/)
  assert.match(statusCard, /active\s*\? siderActiveSurfaceClassName/)
  assert.match(quickControl, /active && siderActiveSurfaceClassName/)
  assert.doesNotMatch(navItem, /border-transparent/)
  assert.match(surfaces, /prominence === 'navigation'[\s\S]*bg-transparent text-base/)
  assert.match(surfaces, /hover:border-default-400\/80/)
  assert.match(
    surfaces,
    /const siderActiveSurfaceClassName =[\s\S]*border-accent\/45 bg-accent-soft\/40[\s\S]*ring-accent\/15/
  )
  assert.match(
    surfaces,
    /const siderActiveIconClassName =[\s\S]*bg-accent-soft text-accent-soft-foreground/
  )
  assert.match(surfaces, /active && siderActiveIconClassName/)
  assert.match(quickControl, /active\s*\? siderActiveIconClassName/)
  assert.match(surfaces, /className=\{siderItemTitleClassName\}/)
  assert.doesNotMatch(
    surfaces,
    /\b(?:border|bg|ring|text)-primary(?:\/\d+)?\b/
  )
  assert.match(surfaces, /focus-visible:outline-accent/)
  assert.match(surfaces, /group-focus-within:text-accent/)
  assert.match(surfaces, /text-success-600 dark:text-success-400/)
  assert.match(surfaces, /text-danger-600 dark:text-danger-400/)
  assert.equal(quickControl.match(/<button/g)?.length, 1)
  assert.match(quickControl, /aria-label=\{title\}/)
  assert.match(quickControl, /data-sider-quick-control/)
  assert.match(quickControl, /sider-quick-control-container w-full min-w-0/)
  assert.match(quickControl, /sider-quick-control__primary/)
  assert.match(quickControl, /sider-quick-control__icon flex size-8 items-center justify-center/)
  assert.match(quickControl, /sider-quick-control__title whitespace-nowrap/)
  assert.match(
    quickControl,
    /className="sider-quick-control__status w-full"[\s\S]*tone=\{enabled \? 'success' : 'default'\}/
  )
  assert.match(quickControl, /data-sider-control-slot/)
  assert.match(
    quickControl,
    /sider-quick-control__control flex min-w-10 items-center justify-center/
  )
  assert.match(quickControl, /<\/button>\s*<div[\s\S]*data-sider-control-slot/)
  assert.doesNotMatch(quickControl, /grid-cols-\[2rem_minmax\(0,1fr\)_auto\]/)
  assert.doesNotMatch(quickControl, /\babsolute\b|right-2\.5|top-2/)
  assert.match(quickControlStyles, /container-type:\s*inline-size/)
  assert.match(
    quickControlStyles,
    /\.sider-quick-control\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/
  )
  assert.match(
    quickControlStyles,
    /\.sider-quick-control__title\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*grid-row:\s*2/
  )
  assert.match(
    quickControlStyles,
    /\.sider-quick-control__status\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*grid-row:\s*3/
  )
  assert.match(quickControlStyles, /@container \(min-width:\s*10rem\)/)
  assert.match(
    quickControlStyles,
    /@container[\s\S]*grid-template-columns:\s*2rem minmax\(0, 1fr\) auto/
  )
  assert.doesNotMatch(quickControlStyles, /position:\s*absolute/)
  assert.match(sidebarSettings, /title: tr\('Quick controls'\)/)
  assert.match(sidebarSettings, /title: 'Kokoro',[\s\S]*reorderable: false/)
  assert.match(sidebarSettings, /title: tr\('Current status'\)/)
  assert.match(sidebarSettings, /title: tr\('Navigation'\)/)
  assert.match(sidebarSettings, /moveSiderItem/)
  assert.match(sidebarSettings, /aria-label=\{`\$\{tr\('Move up'\)\}: \$\{item\.title\}`\}/)
  assert.match(sidebarSettings, /aria-label=\{`\$\{tr\('Move down'\)\}: \$\{item\.title\}`\}/)
  assert.match(sidebarSettings, /patchAppConfig\(\{ siderOrder: nextOrder \}\)/)
  assert.match(sidebarSettings, /isSelected=\{status !== 'hidden'\}/)
  assert.match(sidebarSettings, /group\.reorderable !== false && entries\.length > 1/)
  assert.doesNotMatch(sidebarSettings, /<Radio/)
  assert.match(systemProxy, /<SiderQuickControl/)
  assert.match(systemProxy, /onPress=\{\(\) => navigate\(settingsPath\)\}/)
  assert.match(systemProxy, /control=\{[\s\S]*<BorderSwitch/)
  assert.doesNotMatch(systemProxy, /\.\.\.attributes/)
  assert.match(tun, /<SiderQuickControl/)
  assert.match(tun, /onPress=\{\(\) => navigate\(settingsPath\)\}/)
  assert.match(tun, /control=\{[\s\S]*<BorderSwitch/)
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
  assert.match(dns, /statusTone=\{enable \? 'success' : 'default'\}/)
  assert.doesNotMatch(dns, /\bmt-|translate-y/)
  assert.doesNotMatch(dns, /patchMihomoConfig/)
  assert.match(sniff, /<SiderNavItem/)
  assert.match(sniff, /status=\{enable \? tr\('Enabled'\) : tr\('Disabled'\)\}/)
  assert.match(sniff, /statusTone=\{enable \? 'success' : 'default'\}/)
  assert.doesNotMatch(sniff, /\bmt-|translate-y/)
  assert.doesNotMatch(sniff, /patchMihomoConfig/)
  assert.match(kokoro, /<SiderNavItem/)
  assert.match(kokoro, /prominence="account"/)
  assert.doesNotMatch(kokoro, /useSortable|listeners|setNodeRef/)
  assert.doesNotMatch(kokoro, /Account, plan and profile import/)
  assert.match(rules, /description=\{String\(rules\?\.rules\?\.length \?\? 0\)\}/)
  assert.doesNotMatch(rules, /status=|statusTone=/)
  assert.doesNotMatch(rules, /tr\('\{0\} rules'/)
  assert.match(profile, /<SiderStatusCard/)
  assert.match(profile, /label=\{tr\('Runtime configuration'\)\}/)
  assert.match(profile, /label=\{tr\('Refresh'\)\}/)
  assert.match(outboundMode, /<Tabs\.List/)
  assert.match(outboundMode, /<Tabs\.Indicator/)
  assert.match(outboundMode, /if \(iconOnly\) \{[\s\S]*<Dropdown>/)
  assert.match(outboundMode, /selectionMode="single"/)
  assert.match(outboundMode, /selectedKeys=\{new Set\(\[mode\]\)\}/)
  assert.match(outboundMode, /<Dropdown\.ItemIndicator \/>/)
  assert.match(outboundMode, /LuRoute/)
  assert.match(outboundMode, /LuGlobe/)
  assert.match(outboundMode, /LuArrowRight/)
  assert.doesNotMatch(outboundMode, /compactLabel|orientation=\{iconOnly|flex-col/)
  assert.match(app, /<OutboundModeSwitcher iconOnly \/>[\s\S]*<SiderIconButton/)
  assert.match(app, /label=\{tr\('Application settings'\)\}/)
  assert.match(updater, /iconOnly && \([\s\S]*<SiderIconButton/)
  assert.match(surfaces, /title=\{title\}/)
  assert.doesNotMatch(profile, /<Card/)
  assert.match(connections, /<SiderStatusCard/)
  assert.match(connections, /<TrafficChart/)
  assert.doesNotMatch(connections, /<Card/)

  assert.equal(groupForSiderKey('sysproxy'), 'quick')
  assert.equal(groupForSiderKey('kokoro'), 'account')
  assert.equal(groupForSiderKey('profile'), 'status')
  assert.equal(groupForSiderKey('dns'), 'navigation')
  assert.deepEqual([...accountKeys], ['kokoro'])
  assert.equal(navigationKeys.has('kokoro'), false)
  assert.notEqual(groupForSiderKey('sysproxy'), groupForSiderKey('profile'))
  assert.deepEqual(normalizeSiderOrder(['tun', 'sysproxy', 'tun', 'unknown']).slice(0, 2), [
    'tun',
    'sysproxy'
  ])
  assert.deepEqual(normalizeSiderOrder(['dns', 'kokoro', 'proxy']).slice(0, 3), [
    'dns',
    'kokoro',
    'proxy'
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
  const header = readFileSync('src/renderer/src/components/proxies/proxy-group-header.tsx', 'utf8')
  const settings = readFileSync(
    'src/renderer/src/components/proxies/proxy-setting-drawer.tsx',
    'utf8'
  )
  const tooltip = readFileSync(
    'src/renderer/src/components/proxies/proxy-detail-tooltip.tsx',
    'utf8'
  )

  assert.match(page, /<ProxyGroupHeader/)
  assert.match(header, /min-h-14/)
  assert.match(header, /const GroupMetadata/)
  assert.match(header, /getGroupTypeLabel\(group\.type\)/)
  assert.match(header, /→/)
  assert.match(header, /tr\('\{0\} nodes', \[group\.all\.length\]\)/)
  assert.match(header, /tr\('Current'\)/)
  assert.match(header, /data-expanded=\{isOpen \|\| undefined\}/)
  assert.match(header, /<LuChevronRight/)
  assert.match(header, /aria-label=\{tr\('Test group latency'\)\}/)
  assert.match(header, /aria-label=\{tr\('Show selected proxy'\)\}/)
  assert.match(header, /onPress=\{\(\) => onScrollToProxy\(index\)\}/)
  assert.doesNotMatch(page, /searchVisible|searchValue|onUpdateSearch|CollapseInput/)
  assert.doesNotMatch(page, /Search group|Proxy group actions/)
  assert.match(page, /let groupProxies = group\.all as ProxyLike\[\]/)
  assert.match(page, /proxyDisplayOrder === 'delay'/)
  assert.match(page, /proxyDisplayOrder === 'name'/)
  assert.match(page, /proxyGroupPageCache\.isOpen/)
  assert.match(page, /<GroupedVirtuoso/)
  assert.match(page, /new ResizeObserver/)
  assert.match(page, /setCols\(getAutoProxyColumns\(width\)\)/)
  assert.match(page, /updateColumns\(entry\.contentRect\.width\)/)
  assert.doesNotMatch(page, /window\.matchMedia/)
  assert.match(page, /mode === 'global' && g\[index\]\.name\.toUpperCase\(\) === 'GLOBAL'/)
  assert.match(page, /onGroupDelay=\{onGroupDelayStable\}/)
  assert.match(header, /onPress=\{\(\) => onGroupDelay\(index\)\}/)
  assert.match(page, /border-l-2 border-accent\/20 bg-accent-soft\/15/)
  assert.match(page, /gridTemplateColumns: `repeat\(\$\{pCols === 'auto' \? c : pCols\}/)
  assert.match(item, /return `\$\{delay\} ms`/)
  assert.match(item, /variant="secondary"/)
  assert.match(item, /aria-pressed=\{selected\}/)
  assert.match(item, /data-selected=\{selected \|\| undefined\}/)
  assert.match(item, /selected \? 'bg-accent' : 'bg-transparent'/)
  assert.match(item, /delay === 0 \? 'danger-soft' : 'ghost'/)
  assert.doesNotMatch(item, /isPressable|CardBody/)
  assert.doesNotMatch(item, /delay < 500/)
  assert.equal(settings.match(/<KokoSegmentedControl/g)?.length, 1)
  assert.ok((settings.match(/<KokoSelect/g)?.length ?? 0) >= 5)
  assert.match(settings, /delayTestUrlScope === 'global'/)
  assert.match(settings, /<KokoTextField[\s\S]*tr\('Latency test URL'\)/)
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
  assert.match(item, /<button[\s\S]*type="button"[\s\S]*onClick=\{handleCardPress\}/)
  assert.doesNotMatch(item, /role="button"|event\.key !== 'Enter'|stopPropagation\(\)/)
  assert.match(item, /font-medium text-primary tabular-nums/)
  assert.match(item, /title=\{hideProcess \? destination/)

  assert.match(page, /Close all \{0\} active connections/)
  assert.match(page, /Clear all \{0\} records/)
  assert.doesNotMatch(page, /content=\{filteredConnections\.length\}/)
  assert.match(page, /defaultItemHeight=\{68\}/)
  assert.match(page, /mihomoCloseConnections\(\)/)
  assert.match(page, /connectionInterval = 500/)
  assert.match(page, /<KokoToolbar aria-label=\{tr\('Connections'\)\}>/)
  assert.match(page, /<InputGroup\.Prefix[\s\S]*<LuSearch/)
  assert.match(
    page,
    /<div className="relative min-w-36 flex-1">[\s\S]*<Tooltip delay=\{0\} isOpen=\{Boolean\(compiledFilter\.error\)\}>/
  )
  assert.match(page, /<Tooltip\.Trigger className="block w-full">/)
  assert.match(page, /<div className="relative w-full">[\s\S]*<InputGroup/)
  assert.match(page, /className="h-9 min-h-9 w-full"/)
  assert.doesNotMatch(page, /Tooltip\.Trigger className="relative min-w-36 flex-1"/)
  assert.match(page, /filterInputRef/)
  assert.match(page, /inlineCompletionSuffix/)
  assert.match(page, /filterScrollLeft/)
  assert.match(page, /onKeyDown=\{handleFilterKeyDown\}/)
  assert.match(page, /left-10 right-10/)
  assert.match(page, /aria-label=\{tr\('Sort field'\)\}[\s\S]*density="toolbar"/)
  assert.match(page, /density="toolbar"[\s\S]*valueClassName="text-center"/)
  assert.match(page, /<KokoToolbarIconButton[\s\S]*label=\{connectionDirection/)
  assert.doesNotMatch(page, /className="bg-content2"/)
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
  assert.match(group, /<Card\.Content className="[^"]*\bmin-h-14\b[^"]*\bp-0\b">/)
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
  const heading = readFileSync(
    'src/renderer/src/components/profiles/kokoro-section-heading.tsx',
    'utf8'
  )

  assert.match(page, /function KokoroOptionSection|const KokoroOptionSection/)
  assert.match(page, /<KokoroSectionHeading id=\{headingId\} title=\{title\} \/>/)
  assert.match(page, /title=\{tr\('Subscription options'\)\}/)
  assert.match(page, /title=\{tr\('Update behavior'\)\}/)
  assert.match(page, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/)
  assert.match(page, /<Chip key=\{plan\} size="sm" color="accent" variant="soft">/)
  assert.match(page, /bg-accent-soft font-semibold text-accent-soft-foreground/)
  assert.match(page, /bg-surface transition-colors focus-within:border-accent\/35/)
  assert.doesNotMatch(page, /(?:bg|text)-primary(?:\/|\b)/)
  assert.match(page, /footer=\{[\s\S]*tr\('Fetch and add'\)/)
  assert.match(page, /aria-label=\{tr\('Update rule sets automatically'\)\}/)
  assert.match(page, /aria-label=\{tr\('Update subscription automatically'\)\}/)
  assert.equal(page.match(/labelPlacement="inside"/g)?.length, 6)

  assert.match(rules, /<header className=/)
  assert.match(rules, /<KokoroSectionHeading/)
  assert.match(rules, /<Chip size="sm" color="accent" variant="soft">/)
  assert.match(rules, /rev\. \{ruleSet\.revision\}/)
  assert.match(rules, /focus-within:border-accent\/50 focus-within:bg-accent-soft\/35/)
  assert.match(rules, /text-warning-soft-foreground/)
  assert.doesNotMatch(rules, /(?:bg|text)-primary(?:\/|\b)/)
  assert.match(heading, /rounded-full bg-accent/)
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
  assert.match(rules, /variant="secondary"[\s\S]*tr\('Add rule'\)/)
  assert.match(rules, /variant="primary"[\s\S]*tr\('Save rules'\)/)
  assert.match(rules, /replaceKokoroDefaultRules\(ruleSet\.revision, rules\)/)
})

test('operational lists use compact hierarchy without changing their behavior', () => {
  const rulesPage = readFileSync('src/renderer/src/pages/rules.tsx', 'utf8')
  const ruleItem = readFileSync('src/renderer/src/components/rules/rule-item.tsx', 'utf8')
  const resourcesPage = readFileSync('src/renderer/src/pages/resources.tsx', 'utf8')
  const geoData = readFileSync('src/renderer/src/components/resources/geo-data.tsx', 'utf8')
  const proxyProvider = readFileSync(
    'src/renderer/src/components/resources/proxy-provider.tsx',
    'utf8'
  )
  const ruleProvider = readFileSync(
    'src/renderer/src/components/resources/rule-provider.tsx',
    'utf8'
  )
  const resourceSurfaces = readFileSync(
    'src/renderer/src/components/resources/resource-surfaces.tsx',
    'utf8'
  )
  const appOverrides = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')
  const overridesPage = readFileSync('src/renderer/src/pages/override.tsx', 'utf8')
  const overrideItem = readFileSync(
    'src/renderer/src/components/override/override-item.tsx',
    'utf8'
  )
  const logsPage = readFileSync('src/renderer/src/pages/logs.tsx', 'utf8')
  const logItem = readFileSync('src/renderer/src/components/logs/log-item.tsx', 'utf8')

  assert.match(rulesPage, /<Virtuoso/)
  assert.match(ruleItem, /<Card className="rule-list-card" data-enabled=\{isEnabled\}>/)
  assert.match(ruleItem, /<Card\.Content className="rule-list-card__content">/)
  assert.match(ruleItem, /<Chip size="sm" variant="soft" color="default"/)
  assert.match(ruleItem, /<LuArrowRight[\s\S]*aria-hidden="true"/)
  assert.match(ruleItem, /className="rule-list-card__metric"/)
  assert.match(ruleItem, /data-active=\{hasHits\}/)
  assert.match(ruleItem, /tr\('Match rate'\)/)
  assert.doesNotMatch(appOverrides, /\.rule-list-card\[data-enabled='true'\]/)
  assert.match(
    appOverrides,
    /\.rule-list-card\[data-enabled='false'\]\s*\{[\s\S]*?background: var\(--surface-secondary\);[\s\S]*?opacity: 0\.68/
  )
  assert.match(appOverrides, /\.rule-list-card\s*\{[\s\S]*?border: 1px solid var\(--separator\)/)
  assert.match(appOverrides, /\.rule-list-card:hover/)
  assert.match(appOverrides, /\.rule-list-card:has\(:focus-visible\)/)
  assert.match(appOverrides, /\.rule-list-card__status/)
  assert.match(appOverrides, /\.rule-list-card__metric\s*\{[\s\S]*?background: transparent/)
  assert.match(
    appOverrides,
    /\.rule-list-card__metric\[data-active='true'\]\s*\{[\s\S]*?color: var\(--accent\)/
  )
  assert.match(ruleItem, /aria-label=\{`\$\{tr\('Enable rule'\)\}:/)
  assert.match(ruleItem, /mihomoRulesDisable/)

  assert.match(resourcesPage, /className="resource-page[^"]*max-w-\[68rem\]/)
  assert.match(geoData, /<ResourceSection[\s\S]*title=\{tr\('Geo databases'\)\}/)
  assert.match(geoData, /<ResourceSection title=\{tr\('Update behavior'\)\}>/)
  assert.match(geoData, /<ResourceSettingRow/)
  assert.doesNotMatch(geoData, /SettingCard|SettingItem|w-\[70%\]/)
  assert.match(geoData, /controlWidth="full"/)
  assert.match(geoData, /title=\{value\}/)
  assert.match(geoData, /mihomoUpgradeGeo\(\)/)
  assert.match(resourceSurfaces, /export const ResourceSection/)
  assert.match(resourceSurfaces, /export const ResourceSettingRow/)
  assert.match(resourceSurfaces, /export const ResourceProviderRow/)
  assert.match(appOverrides, /container-name: resources/)
  assert.match(appOverrides, /grid-template-columns: minmax\(10rem, 12rem\) minmax\(0, 1fr\) auto/)
  assert.match(appOverrides, /@container resources \(max-width: 42rem\)/)
  assert.match(proxyProvider, /<ResourceProviderRow/)
  assert.match(proxyProvider, /tr\('\{0\} proxies', \[provider\.proxies\?\.length \|\| 0\]\)/)
  assert.match(proxyProvider, /variant="ghost"[\s\S]*tr\('Update all'\)/)
  assert.doesNotMatch(proxyProvider, /SettingCard|SettingItem|<Chip/)
  assert.match(ruleProvider, /<ResourceProviderRow/)
  assert.match(ruleProvider, /tr\('\{0\} rules', \[provider\.ruleCount\]\)/)
  assert.match(ruleProvider, /provider\.vehicleType\} · \$\{provider\.behavior\}/)
  assert.match(ruleProvider, /variant="ghost"[\s\S]*tr\('Update all'\)/)
  assert.doesNotMatch(ruleProvider, /SettingCard|SettingItem|<Chip|::/)
  assert.match(ruleProvider, /mihomoUpdateRuleProviders/)

  assert.match(overridesPage, /<CollectionGrid>/)
  assert.doesNotMatch(overridesPage, /lg:grid-cols-3|xl:grid-cols-4/)
  assert.match(overridesPage, /addOverrideItem/)
  assert.match(overrideItem, /<CollectionCard/)
  assert.match(overrideItem, /<Chip size="sm" variant="soft" color="accent">/)
  assert.match(overrideItem, /<KokoActionMenu/)
  assert.match(overrideItem, /onAction=\{onMenuAction\}/)

  assert.match(logsPage, /<Virtuoso/)
  assert.match(logsPage, /<KokoSearchField/)
  assert.match(logsPage, /<KokoToolbar aria-label=\{tr\('Live logs'\)\}>/)
  assert.match(logsPage, /<KokoSelect[\s\S]*density="toolbar"/)
  assert.match(logsPage, /<KokoToolbarIconButton[\s\S]*isActive=\{trace\}/)
  assert.match(logsPage, /<KokoToolbarIconButton[\s\S]*tone="danger"/)
  assert.doesNotMatch(logsPage, /<Select\.Trigger|<Select\.Popover|<ListBox/)
  assert.match(logsPage, /followOutput=\{trace\}/)
  assert.match(logsPage, /clearMihomoLogs\(\)/)
  assert.match(logsPage, /restartMihomoLogs\(\)/)
  assert.doesNotMatch(logItem, /<Card/)
  assert.match(logItem, /grid-cols-\[5\.25rem_4\.5rem_minmax\(0,1fr\)\]/)
  assert.match(logItem, /data-log-level=\{type\}/)
  assert.match(logItem, /border-b border-l-2 border-b-divider\/70/)
  assert.match(logItem, /export const KokoLogLevelBadge/)
  assert.match(logItem, /export const KokoLogToken/)
  assert.match(logItem, /message\.secondary/)
  assert.match(logItem, /DIRECT[\s\S]*bg-success-soft/)
  assert.match(logItem, /REJECT[\s\S]*bg-danger-soft/)
  assert.match(logItem, /protocol: 'font-semibold text-accent-soft-foreground'/)
  assert.match(logItem, /domain: 'font-semibold text-foreground'/)
  assert.match(logItem, /rule: 'rounded bg-warning-soft\/50/)
  assert.match(logItem, /process: 'rounded bg-surface-secondary/)
  assert.match(logItem, /border-l-warning\/70 bg-warning-soft\/20/)
  assert.match(logItem, /border-l-danger\/70 bg-danger-soft\/20/)
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

test('log messages expose semantic network and routing tokens without losing content', () => {
  const payload =
    '[TCP] 127.0.0.1:51390(firefox) --> chatgpt.com:443 match RuleSet(openai) using Direct-Special.anytls'
  const parsed = parseLogMessage(payload)

  assert.equal(
    parsed.primary.map((token) => token.value).join(''),
    '[TCP] 127.0.0.1:51390(firefox) --> chatgpt.com:443'
  )
  assert.equal(
    parsed.secondary?.map((token) => token.value).join(''),
    'match RuleSet(openai) using Direct-Special.anytls'
  )
  assert.deepEqual(
    parsed.primary.filter((token) => token.kind !== 'text').map((token) => token.kind),
    ['protocol', 'ip', 'port', 'process', 'domain', 'port']
  )
  assert.deepEqual(
    parsed.secondary?.filter((token) => token.kind !== 'text').map((token) => token.kind),
    ['keyword', 'rule', 'keyword', 'action']
  )
})

test('log messages recognize only explicit high-confidence error markers', () => {
  const parsed = parseLogMessage('error: connection failed after timeout; upstream refused')

  assert.deepEqual(
    parsed.primary.filter((token) => token.kind === 'error').map((token) => token.value),
    ['error:', 'failed', 'timeout', 'refused']
  )
  assert.equal(
    parseLogMessage('failure handling remains deterministic').primary.some(
      (token) => token.kind === 'error'
    ),
    false
  )
})

test('common settings choices use the shared segmented control', () => {
  const general = readFileSync('src/renderer/src/components/settings/general-config.tsx', 'utf8')
  const controls = readFileSync('src/renderer/src/components/base/base-controls.tsx', 'utf8')
  const segmentedControl = controls.slice(controls.indexOf('export const KokoSegmentedControl'))
  const rendererFiles = collectTsxFiles('src/renderer/src')

  assert.match(controls, /export const KokoSegmentedControl/)
  assert.match(segmentedControl, /<ToggleButtonGroup/)
  assert.doesNotMatch(segmentedControl, /<Tabs(?:\.|\s)/)
  assert.match(general, /ariaLabel=\{tr\('Notification style'\)\}/)
  assert.match(general, /ariaLabel=\{tr\('Update channel'\)\}/)
  assert.match(general, /icon: <LuBell aria-hidden="true" \/>/)
  assert.match(general, /icon: <LuAppWindow aria-hidden="true" \/>/)
  assert.match(general, /<KokoSegmentedControl/)
  assert.match(general, /controlWidth="select"/)
  assert.doesNotMatch(general, /<Tabs/)
  for (const file of rendererFiles) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\bSettingTabs\b/)
  }
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
