import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import ts from 'typescript'
import { getLocale, resolveLocale, setLocale, tr } from '../src/shared/i18n.ts'
import { messages as english } from '../src/shared/locales/en.ts'
import { messages as simplifiedChinese } from '../src/shared/locales/zh-CN.ts'
import { messages as traditionalChinese } from '../src/shared/locales/zh-TW.ts'

const catalogs = { en: english, 'zh-CN': simplifiedChinese, 'zh-TW': traditionalChinese }

afterEach(() => setLocale('en'))

test('resolves system language variants and respects an explicit preference', () => {
  for (const system of ['zh-TW', 'zh_HK', 'zh-MO', 'zh-Hant', 'zh-Hant-US']) {
    assert.equal(resolveLocale('system', [system]), 'zh-TW')
    assert.equal(resolveLocale(undefined, [system]), 'zh-TW')
    assert.equal(resolveLocale('zh-CN', [system]), 'zh-CN')
  }
  for (const system of ['zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-TW']) {
    assert.equal(resolveLocale('system', [system]), 'zh-CN')
    assert.equal(resolveLocale('zh-TW', [system]), 'zh-TW')
  }
  for (const system of ['en', 'en-US', 'en_GB', 'en-AU', 'EN-ca']) {
    assert.equal(resolveLocale('system', [system]), 'en')
    assert.equal(resolveLocale(undefined, [system]), 'en')
    assert.equal(resolveLocale('zh-TW', [system]), 'zh-TW')
    assert.equal(resolveLocale('zh-CN', [system]), 'zh-CN')
  }
  assert.equal(resolveLocale('en', ['zh-TW']), 'en')
  assert.equal(resolveLocale('en', ['zh-CN']), 'en')
  assert.equal(resolveLocale('system', ['en-US', 'zh-Hant-TW']), 'en')
  assert.equal(resolveLocale('system', ['zh-Hant-TW', 'en-US']), 'zh-TW')
  assert.equal(resolveLocale('system', ['fr-FR', 'en-GB']), 'en')
  assert.equal(resolveLocale('system', ['fr-FR']), 'en')
  assert.equal(resolveLocale('invalid', ['zh-HK']), 'zh-TW')
  assert.equal(resolveLocale(null), 'en')
})

test('translates application messages without rewriting interpolation data', () => {
  setLocale('zh-TW')
  assert.equal(getLocale(), 'zh-TW')
  assert.equal(tr('Application settings'), '應用程式設定')
  assert.equal(tr('Connections'), '連線')
  assert.equal(tr('Global'), '全域')
  assert.equal(tr('Kokoro subscription'), 'Kokoro 訂閱')
  const nodeName = '香港节点 {1} $& <proxy> 🎐'
  const url = 'https://example.invalid/订阅?token=测试'
  assert.equal(tr('Failed to update {0}\n{1}', [nodeName, url]), `${nodeName} 更新失敗\n${url}`)
  assert.equal(tr('Used this month: {0} / {1}', [0, '500 GB']), '本月已用 0 / 500 GB')
  assert.equal(tr('unknown {0}', ['原始配置']), 'unknown 原始配置')
  assert.equal(tr('missing {0}'), 'missing {0}')
  assert.equal(tr('toString'), 'toString')
  assert.equal(tr('__proto__'), '__proto__')
  setLocale('zh-CN')
  assert.equal(tr('Application settings'), '应用设置')
  assert.equal(tr('Failed to update {0}\n{1}', [nodeName, url]), `${nodeName} 更新失败\n${url}`)
})

test('all catalog translations preserve placeholders and intentional whitespace', () => {
  const placeholders = (text: string): string[] => (text.match(/\{\d+\}/g) || []).sort()
  for (const messages of Object.values(catalogs)) {
    for (const [source, translation] of Object.entries(messages)) {
      assert.ok(translation.trim(), `Empty translation: ${source}`)
      assert.deepEqual(placeholders(translation), placeholders(source), source)
      assert.equal(translation.match(/^\s*/)?.[0], source.match(/^\s*/)?.[0], source)
      assert.equal(translation.match(/\s*$/)?.[0], source.match(/\s*$/)?.[0], source)
    }
  }
})

test('localized catalogs completely cover the canonical English source catalog', () => {
  assert.deepEqual(Object.keys(english).sort(), Object.keys(simplifiedChinese).sort())
  assert.deepEqual(Object.keys(english).sort(), Object.keys(traditionalChinese).sort())
  for (const [source, translation] of Object.entries(english)) {
    assert.equal(translation, source)
    assert.doesNotMatch(translation, /\p{Script=Han}/u, source)
    assert.deepEqual(translation.match(/<[^>]+>/g), source.match(/<[^>]+>/g), source)
  }
})

test('Chinese catalogs preserve canonical networking and product terminology', () => {
  const expected: Readonly<
    Record<string, readonly [simplifiedChinese: string, traditionalChinese: string]>
  > = {
    'Fake IP settings': ['Fake IP 设置', 'Fake IP 設定'],
    'Fake IP': ['Fake IP', 'Fake IP'],
    'Fake IP range (IPv4)': ['Fake IP 范围 (IPv4)', 'Fake IP 範圍 (IPv4)'],
    'Fake IP range (IPv6)': ['Fake IP 范围 (IPv6)', 'Fake IP 範圍 (IPv6)'],
    'Fake IP filter': ['Fake IP 过滤器', 'Fake IP 過濾器'],
    'Fake-IP filter mode': ['Fake-IP 过滤模式', 'Fake-IP 過濾模式'],
    'TUN interface name': ['TUN 网卡名称', 'TUN 網路卡名稱'],
    'TUN network stack': ['TUN 网络栈', 'TUN 網路堆疊'],
    'Toggle TUN mode': ['切换 TUN 模式', '切換 TUN 模式'],
    'HTTP port': ['HTTP 端口', 'HTTP 連接埠'],
    'SOCKS port': ['SOCKS 端口', 'SOCKS 連接埠'],
    'TLS sniffing ports': ['TLS 嗅探端口', 'TLS 嗅探連接埠'],
    'Proxy DNS servers': ['代理 DNS 服务器', '代理 DNS 伺服器'],
    'GeoIP mode': ['GeoIP 模式', 'GeoIP 模式'],
    'GeoIP-MMDB database': ['GeoIP-MMDB 数据库', 'GeoIP-MMDB 資料庫'],
    'GeoSite database': ['GeoSite 数据库', 'GeoSite 資料庫'],
    'WebDAV backup': ['WebDAV 备份', 'WebDAV 備份'],
    'Gist synchronization': ['Gist 同步', 'Gist 同步'],
    'VMess always uses relay mode': ['VMess 固定使用中继模式', 'VMess 固定使用中繼模式']
  }

  for (const [source, [simplified, traditional]] of Object.entries(expected)) {
    assert.equal(simplifiedChinese[source], simplified, `zh-CN: ${source}`)
    assert.equal(traditionalChinese[source], traditional, `zh-TW: ${source}`)
  }

  assert.doesNotMatch(Object.values(simplifiedChinese).join('\n'), /虚假 IP/)
  assert.doesNotMatch(Object.values(traditionalChinese).join('\n'), /虛假 IP/)
  assert.match(
    simplifiedChinese['Enable a local Mihomo SOCKS or mixed listener first'],
    /Mihomo SOCKS.*mixed/
  )
  assert.match(
    traditionalChinese['Enable a local Mihomo SOCKS or mixed listener first'],
    /Mihomo SOCKS.*mixed/
  )
})

test('English UI, native menu, OAuth and interpolated messages retain user data', () => {
  setLocale('en')
  assert.equal(getLocale(), 'en')
  assert.equal(tr('Application settings'), 'Application settings')
  assert.equal(tr('Interface language'), 'Interface language')
  assert.equal(tr('Restart to apply language'), 'Restart to apply language')
  assert.equal(tr('About KokoroBox'), 'About KokoroBox')
  assert.equal(tr('Connections'), 'Connections')
  assert.equal(tr('Close'), 'Close')
  assert.equal(tr('Off'), 'Off')
  assert.equal(tr('System proxy disabled'), 'System proxy disabled')
  assert.equal(tr('TUN mode enabled'), 'TUN mode enabled')
  assert.equal(tr('Sign in to Kokoro'), 'Sign in to Kokoro')
  assert.equal(
    tr('Kokoro authorization failed. Please sign in again'),
    'Kokoro authorization failed. Please sign in again'
  )
  const name = '香港节点 {1} $& <proxy> 🎐'
  const url = 'https://example.invalid/订阅?token=测试'
  assert.equal(tr('Failed to update {0}\n{1}', [name, url]), `Failed to update ${name}\n${url}`)
  assert.equal(tr('Used this month: {0} / {1}', [0, '500 GB']), 'Used this month: 0 / 500 GB')
  assert.equal(tr(' · Expires {0}', ['2026-12-31']), ' · Expires 2026-12-31')
  assert.equal(tr('unknown {0}', ['原始配置']), 'unknown 原始配置')
  assert.equal(tr('missing {0}'), 'missing {0}')
  assert.equal(tr('toString'), 'toString')
  assert.equal(tr('__proto__'), '__proto__')
})

test('preload carries English into isolated and non-isolated renderer startup', () => {
  const source = ts.transpileModule(readFileSync('src/preload/index.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  for (const contextIsolated of [true, false]) {
    for (const locale of ['en', 'zh-TW', 'zh-CN']) {
      const exposed: Record<string, unknown> = {}
      const dependencies: Record<string, unknown> = {
        electron: {
          contextBridge: {
            exposeInMainWorld: (name: string, value: unknown) => {
              exposed[name] = value
            }
          },
          webUtils: {}
        },
        '@electron-toolkit/preload': { electronAPI: {} }
      }
      new Function('require', 'exports', 'process', 'window', source)(
        (name: string) => {
          assert.ok(name in dependencies)
          return dependencies[name]
        },
        {},
        { argv: ['app', `--kokorobox-locale=${locale}`], contextIsolated, platform: 'darwin' },
        exposed
      )
      assert.equal((exposed.api as { locale: string }).locale, locale)
    }
  }
  const i18n = ts.transpileModule(readFileSync('src/shared/i18n.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports: { tr?: (key: string) => string } = {}
  new Function('require', 'exports', 'globalThis', i18n)(
    (name: string) => {
      const dependencies: Record<string, Readonly<Record<string, string>>> = {
        './locales/en': english,
        './locales/zh-CN': simplifiedChinese,
        './locales/zh-TW': traditionalChinese
      }
      assert.ok(name in dependencies)
      return { messages: dependencies[name] }
    },
    exports,
    { api: { locale: 'en' } }
  )
  assert.equal(exports.tr?.('Application settings'), 'Application settings')
})

test('application translation calls use canonical English keys with complete arguments', () => {
  const sourceRoot = path.resolve('src')
  const files = readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' }).filter(
    (file) => /^(main|renderer)[/\\].*\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts')
  )
  let calls = 0
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(path.join(sourceRoot, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'tr'
      ) {
        const key = node.arguments[0]
        assert.ok(key && ts.isStringLiteral(key), `Use a static message key in ${file}`)
        assert.doesNotMatch(key.text, /\p{Script=Han}/u, `Use English source text in ${file}`)
        for (const [locale, messages] of Object.entries(catalogs)) {
          assert.ok(
            Object.hasOwn(messages, key.text),
            `Missing ${locale} translation in ${file}: ${key.text}`
          )
        }
        const parameters = [...key.text.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1]))
        if (parameters.length) {
          const values = node.arguments[1]
          assert.ok(
            values && ts.isArrayLiteralExpression(values),
            `Missing values in ${file}: ${key.text}`
          )
          assert.equal(values.elements.length, Math.max(...parameters) + 1, key.text)
        }
        calls++
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.ok(calls > 0)
})

test('guided tour introduces Kokoro settings before profile import', () => {
  const tour = readFileSync('src/renderer/src/utils/driver.ts', 'utf8')
  const kokoroCardStep = tour.indexOf("element: '.kokoro-setting-card'")
  const kokoroPageStep = tour.indexOf("element: '.kokoro-settings-guide'")
  const profileStep = tour.indexOf("element: '.profile-card'")

  assert.ok(kokoroCardStep >= 0)
  assert.ok(kokoroPageStep > kokoroCardStep)
  assert.ok(profileStep > kokoroPageStep)
  assert.match(tour.slice(kokoroCardStep, kokoroPageStep), /navigate\('\/kokoro'\)/)
  const kokoroPage = readFileSync(
    'src/renderer/src/components/profiles/kokoro-subscription-modal.tsx',
    'utf8'
  )
  assert.match(kokoroPage, /kokoro-settings-guide/)
  assert.match(kokoroPage, /!session\?\.authenticated\s*&&\s*\(\s*<header/)
})

test('global subscription settings are owned by Application settings', () => {
  const profileDrawer = readFileSync(
    'src/renderer/src/components/profiles/profile-setting-drawer.tsx',
    'utf8'
  )
  const subscriptionSettings = readFileSync(
    'src/renderer/src/components/settings/subscription-integration-settings.tsx',
    'utf8'
  )
  const settingsPage = readFileSync('src/renderer/src/pages/settings.tsx', 'utf8')
  const settingsRegistry = readFileSync(
    'src/renderer/src/components/settings/settings-registry.tsx',
    'utf8'
  )

  for (const key of [
    'diffWorkDir',
    'userAgent',
    'gistSyncEnabled',
    'gistEncrypted',
    'gistAgeRecipient',
    'gistAgeIdentity'
  ]) {
    assert.doesNotMatch(profileDrawer, new RegExp(`\\b${key}\\b`))
    assert.match(subscriptionSettings, new RegExp(`\\b${key}\\b`))
  }

  assert.match(profileDrawer, /navigate\('\/settings\?section=data'\)/)
  assert.match(settingsPage, /getSettingsCategories/)
  assert.match(settingsRegistry, /<SubscriptionDataSettings \/>/)
  assert.match(settingsRegistry, /<GistIntegrationSettings \/>/)
})

test('Application settings search supports stable deep links to concrete rows', () => {
  const settingsPage = readFileSync('src/renderer/src/pages/settings.tsx', 'utf8')
  const settingsRegistry = readFileSync(
    'src/renderer/src/components/settings/settings-registry.tsx',
    'utf8'
  )
  const settingItem = readFileSync('src/renderer/src/components/base/base-setting-item.tsx', 'utf8')

  assert.match(settingsRegistry, /interface SettingsEntryDefinition/)
  assert.match(settingsRegistry, /id: string/)
  assert.match(settingsPage, /nextParams\.set\('setting', settingId\)/)
  assert.match(settingsPage, /scrollIntoView/)
  assert.match(settingItem, /data-setting-label=/)
})

test('contextual settings drawers share a sectioned shell', () => {
  const drawers = [
    'src/renderer/src/components/proxies/proxy-setting-drawer.tsx',
    'src/renderer/src/components/connections/connection-setting-drawer.tsx',
    'src/renderer/src/components/profiles/profile-setting-drawer.tsx',
    'src/renderer/src/components/app-routing/app-routing-setting-drawer.tsx'
  ]

  for (const drawer of drawers) {
    const source = readFileSync(drawer, 'utf8')
    assert.match(source, /base-settings-drawer/)
    assert.match(source, /<PageSettingsDrawer/)
    assert.match(source, /<PageSettingsSection/)
    assert.doesNotMatch(source, /<Drawer\./)
  }
})

test('core feature settings pages use the shared desktop layout', () => {
  const pages = [
    'src/renderer/src/components/settings/network/system-proxy-settings.tsx',
    'src/renderer/src/components/settings/network/tun-settings.tsx',
    'src/renderer/src/components/settings/network/dns-settings.tsx',
    'src/renderer/src/components/settings/network/sniffer-settings.tsx',
    'src/renderer/src/components/settings/network/mihomo-settings.tsx'
  ]
  const layout = readFileSync('src/renderer/src/components/base/base-feature-settings.tsx', 'utf8')
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')

  assert.match(layout, /<SettingCardModeProvider value=\{false\}>/)
  assert.doesNotMatch(layout, /SettingItemModeProvider/)
  assert.match(
    styles,
    /\.feature-settings-layout \.setting-item__content\s*\{[^}]*justify-content: flex-end/s
  )
  assert.match(
    styles,
    /\.settings-section__content > \.setting-item__divider:last-child[\s\S]*display: none/
  )

  for (const page of pages) {
    const source = readFileSync(page, 'utf8')
    assert.match(source, /base-feature-settings/)
    assert.match(source, /<FeatureSettingsLayout(?:\s|>)/)
    assert.match(source, /<FeatureSettingsSection/)
  }
})

test('migrated feature settings use modern rows and stable save actions', () => {
  const featureFiles = [
    'src/renderer/src/components/settings/network/system-proxy-settings.tsx',
    'src/renderer/src/components/settings/network/tun-settings.tsx',
    'src/renderer/src/components/settings/network/dns-settings.tsx',
    'src/renderer/src/components/settings/network/sniffer-settings.tsx',
    'src/renderer/src/components/settings/network/mihomo-settings.tsx',
    'src/renderer/src/components/dns/advanced-dns-setting.tsx',
    'src/renderer/src/components/mihomo/advanced-settings.tsx',
    'src/renderer/src/components/mihomo/port-setting.tsx',
    'src/renderer/src/components/mihomo/controller-setting.tsx',
    'src/renderer/src/components/mihomo/core-log-setting.tsx'
  ]

  for (const file of featureFiles) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /compatKey=["']legacy["']/)
  }

  for (const page of featureFiles.slice(0, 5)) {
    const source = readFileSync(page, 'utf8')
    assert.match(source, /<FeatureSettingsSaveButton/)
    assert.match(source, /useSettingsSave\(\)/)
    assert.match(source, /const saved = await runSave/)
    assert.match(source, /isSaving=\{isSaving\}/)
  }

  for (const page of featureFiles.slice(0, 4)) {
    const source = readFileSync(page, 'utf8')
    assert.match(source, /isDirty=\{changed\}/)
    assert.match(source, /if \(saved\) setChanged\(false\)/)
  }

  for (const page of featureFiles.slice(1, 4)) {
    const source = readFileSync(page, 'utf8')
    assert.match(source, /patchControledMihomoConfigOrThrow\(patch\)/)
  }
})
