import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import ts from 'typescript'
import { getLocale, resolveLocale, setLocale, tr } from '../src/shared/i18n.ts'
import { messages } from '../src/shared/locales/zh-TW.ts'

afterEach(() => setLocale('zh-CN'))

test('resolves system language variants and respects an explicit preference', () => {
  for (const system of ['zh-TW', 'zh_HK', 'zh-MO', 'zh-Hant', 'zh-Hant-US']) {
    assert.equal(resolveLocale('system', [system]), 'zh-TW')
    assert.equal(resolveLocale(undefined, [system]), 'zh-TW')
    assert.equal(resolveLocale('zh-CN', [system]), 'zh-CN')
  }
  for (const system of ['zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-TW', 'en-US']) {
    assert.equal(resolveLocale('system', [system]), 'zh-CN')
    assert.equal(resolveLocale('zh-TW', [system]), 'zh-TW')
  }
  assert.equal(resolveLocale('system', ['en-US', 'zh-Hant-TW']), 'zh-TW')
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
  for (const [source, translation] of Object.entries(messages)) {
    assert.ok(translation.trim(), `Empty translation: ${source}`)
    assert.deepEqual(placeholders(translation), placeholders(source), source)
    assert.equal(translation.match(/^\s*/)?.[0], source.match(/^\s*/)?.[0], source)
    assert.equal(translation.match(/\s*$/)?.[0], source.match(/\s*$/)?.[0], source)
  }
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
        assert.ok(Object.hasOwn(messages, key.text), `Missing translation in ${file}: ${key.text}`)
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
