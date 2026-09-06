import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import ts from 'typescript'
import { getLocale, resolveLocale, setLocale, tr } from '../src/shared/i18n.ts'
import { messages } from '../src/shared/locales/zh-TW.ts'
import { messages as english } from '../src/shared/locales/en.ts'

const catalogs = { 'zh-TW': messages, en: english }

afterEach(() => setLocale('zh-CN'))

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
  assert.equal(resolveLocale('system', ['fr-FR']), 'zh-CN')
  assert.equal(resolveLocale('invalid', ['zh-HK']), 'zh-TW')
  assert.equal(resolveLocale(null), 'zh-CN')
})

test('translates application messages without rewriting interpolation data', () => {
  setLocale('zh-TW')
  assert.equal(getLocale(), 'zh-TW')
  assert.equal(tr('应用设置'), '應用程式設定')
  assert.equal(tr('连接'), '連線')
  assert.equal(tr('全局'), '全域')
  assert.equal(tr('Kokoro 订阅'), 'Kokoro 訂閱')
  const nodeName = '香港节点 {1} $& <proxy> 🎐'
  const url = 'https://example.invalid/订阅?token=测试'
  assert.equal(tr('{0} 更新失败\n{1}', [nodeName, url]), `${nodeName} 更新失敗\n${url}`)
  assert.equal(tr('本月已用 {0} / {1}', [0, '500 GB']), '本月已用 0 / 500 GB')
  assert.equal(tr('unknown {0}', ['原始配置']), 'unknown 原始配置')
  assert.equal(tr('missing {0}'), 'missing {0}')
  assert.equal(tr('toString'), 'toString')
  assert.equal(tr('__proto__'), '__proto__')
  setLocale('zh-CN')
  assert.equal(tr('应用设置'), '应用设置')
  assert.equal(tr('{0} 更新失败\n{1}', [nodeName, url]), `${nodeName} 更新失败\n${url}`)
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

test('English covers the complete catalog without untranslated Chinese or altered HTML', () => {
  assert.deepEqual(Object.keys(english).sort(), Object.keys(messages).sort())
  for (const [source, translation] of Object.entries(english)) {
    assert.doesNotMatch(translation, /\p{Script=Han}/u, source)
    assert.deepEqual(translation.match(/<[^>]+>/g), source.match(/<[^>]+>/g), source)
  }
})

test('English UI, native menu, OAuth and interpolated messages retain user data', () => {
  setLocale('en')
  assert.equal(getLocale(), 'en')
  assert.equal(tr('应用设置'), 'Application settings')
  assert.equal(tr('界面语言'), 'Interface language')
  assert.equal(tr('重启以应用语言'), 'Restart to apply language')
  assert.equal(tr('关于 KokoroBox'), 'About KokoroBox')
  assert.equal(tr('连接'), 'Connections')
  assert.equal(tr('关闭'), 'Close')
  assert.equal(tr('已关闭'), 'Disabled')
  assert.equal(tr('系统代理已关闭'), 'System proxy disabled')
  assert.equal(tr('虚拟网卡已开启'), 'TUN mode enabled')
  assert.equal(tr('登录 Kokoro'), 'Sign in to Kokoro')
  assert.equal(
    tr('Kokoro 授权失败，请重新登录'),
    'Kokoro authorization failed. Please sign in again'
  )
  const name = '香港节点 {1} $& <proxy> 🎐'
  const url = 'https://example.invalid/订阅?token=测试'
  assert.equal(tr('{0} 更新失败\n{1}', [name, url]), `Failed to update ${name}\n${url}`)
  assert.equal(tr('本月已用 {0} / {1}', [0, '500 GB']), 'Used this month: 0 / 500 GB')
  assert.equal(tr(' · {0} 到期', ['2026-12-31']), ' · Expires 2026-12-31')
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
      assert.ok(['./locales/zh-TW', './locales/en'].includes(name))
      return { messages: name.endsWith('/en') ? english : messages }
    },
    exports,
    { api: { locale: 'en' } }
  )
  assert.equal(exports.tr?.('应用设置'), 'Application settings')
})

test('application translation calls have catalog entries and complete arguments', () => {
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
  assert.match(
    readFileSync('src/renderer/src/components/profiles/kokoro-subscription-modal.tsx', 'utf8'),
    /kokoro-settings-guide/
  )
})
