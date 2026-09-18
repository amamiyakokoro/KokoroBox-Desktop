import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { mergeSettingsPatch } from '../src/renderer/src/utils/merge-settings-patch.ts'
import {
  groupForSiderKey,
  normalizeSiderOrder
} from '../src/renderer/src/components/sider/sider-order.ts'
import { normalizeCoreVersion } from '../src/renderer/src/components/sider/core-version.ts'

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
  const styles = readFileSync('src/renderer/src/assets/main-compatible.css', 'utf8')
  const settingCard = readFileSync('src/renderer/src/components/base/base-setting-card.tsx', 'utf8')
  const general = readFileSync('src/renderer/src/components/settings/general-config.tsx', 'utf8')

  assert.match(settings, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(settings, /event\.key\.toLowerCase\(\) === 'f'/)
  assert.match(settings, /settings-content-header sticky top-0/)
  assert.match(settings, /scrollTo\(\{ top: 0 \}\)/)
  assert.match(settings, /settings-navigation-list no-scrollbar/)
  assert.match(settings, /settings-container min-h-full/)
  assert.match(settings, /max-w-\[960px\]/)
  assert.match(settings, /entry\.fallbackLabel/)
  assert.match(settings, /panelLabel/)
  assert.match(settings, /item\.panels\?\.find\(\(panel\) => panel\.key === entry\.panel\)/)
  assert.match(styles, /\.settings-container \{[\s\S]*container-type: inline-size/)
  assert.match(styles, /@container settings \(max-width: 50rem\)/)
  assert.doesNotMatch(styles, /@media \(max-width: 1050px\)/)
  assert.match(styles, /\.settings-navigation-list \{[\s\S]*flex-direction: row/)
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
  const profile = readFileSync('src/renderer/src/components/sider/profile-card.tsx', 'utf8')
  const connections = readFileSync('src/renderer/src/components/sider/conn-card.tsx', 'utf8')
  const quickControl = surfaces.slice(surfaces.indexOf('export const SiderQuickControl'))

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
  assert.match(surfaces, /metadataSeparator = '·'/)
  assert.match(surfaces, /showChevron \?\? !actions/)
  assert.match(surfaces, /prioritizeDescription \? 'min-w-0 truncate' : 'shrink-0'/)
  assert.match(surfaces, /columns === 2 \? 'grid grid-cols-2 gap-1\.5' : 'flex flex-col gap-1\.5'/)
  assert.match(surfaces, /aria-current=\{active \? 'page' : undefined\}/)
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
  assert.match(core, /status=\{version \? `\$\{tr\('Memory'\)\}/)
  assert.match(core, /aria-label=\{tr\('Restart'\)\}/)
  assert.match(dns, /<SiderNavItem/)
  assert.doesNotMatch(dns, /patchMihomoConfig/)
  assert.match(sniff, /<SiderNavItem/)
  assert.doesNotMatch(sniff, /patchMihomoConfig/)
  assert.match(profile, /<SiderStatusCard/)
  assert.match(profile, /aria-label=\{tr\('Runtime configuration'\)\}/)
  assert.match(profile, /aria-label=\{tr\('Refresh'\)\}/)
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
