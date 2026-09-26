import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseYaml, stringifyYaml } from '../src/main/utils/yaml.ts'

type Profile = { proxies: Array<{ 'reality-opts': { 'short-id': unknown } }> }
const shortId = (source: string): unknown =>
  parseYaml<Profile>(source).proxies[0]['reality-opts']['short-id']

test('REALITY short IDs retain their spelling across block, flow and quoted keys', () => {
  for (const source of [
    'proxies:\n  - reality-opts:\n      short-id: 001234 # comment\n',
    'proxies:\n- reality-opts:\n    short-id: 001234\n',
    'proxies:\n  - reality-opts: {short-id: 001234}\n',
    'proxies: [{reality-opts: {short-id: 001234}}]',
    '"proxies": [{"reality-opts": {"short-id": 001234}}]'
  ]) {
    assert.equal(shortId(source), '001234', source)
    assert.equal(shortId(stringifyYaml(parseYaml(source))), '001234', source)
  }
})

test('REALITY numeric-looking values preserve precision and original syntax', () => {
  for (const value of ['9999999999999999', '0', '0000', '0x1234', '1e10', '12345678']) {
    const source = `proxies: [{reality-opts: {short-id: ${value}}}]`
    assert.equal(shortId(source), value)
    assert.equal(shortId(stringifyYaml(parseYaml(source))), value)
  }
})

test('nested proxies and standalone REALITY options retain short IDs', () => {
  const source = 'nested: {proxies: [{reality-opts: {short-id: 001234}}]}'
  assert.equal(
    parseYaml<{ nested: Profile }>(source).nested.proxies[0]['reality-opts']['short-id'],
    '001234'
  )
  assert.deepEqual(parseYaml('reality-opts: {short-id: 001234}'), {
    'reality-opts': { 'short-id': '001234' }
  })
})

test('anchors, aliases and YAML merges preserve REALITY option templates', () => {
  for (const source of [
    'template: &base\n  reality-opts: {short-id: 001234}\nproxies:\n  - <<: *base\n    name: example\n',
    'reality-opts: &opts {short-id: 001234}\nproxies: [{reality-opts: *opts}]'
  ]) {
    assert.equal(shortId(source), '001234')
  }
  assert.deepEqual(parseYaml('base: &base {port: 443}\nnode: {<<: *base, name: test}'), {
    base: { port: 443 },
    node: { port: 443, name: 'test' }
  })
})

test('explicit tags, strings, nulls and collections keep their YAML semantics', () => {
  for (const [value, expected] of [
    ['"001234"', '001234'],
    ["'001234'", '001234'],
    ['!!str 001234', '001234'],
    ['!!int 1234', 1234],
    ['!!bool true', true],
    ['null', null],
    ['~', null],
    ['', null],
    ['[12, 34]', [12, 34]],
    ['{value: 12}', { value: 12 }]
  ] as const) {
    assert.deepEqual(shortId(`proxies: [{reality-opts: {short-id: ${value}}}]`), expected)
  }
})

test('other short-id fields, numbers and multiline strings are not rewritten', () => {
  assert.deepEqual(parseYaml('short-id: 1234\nport: 7890\nflag: true'), {
    'short-id': 1234,
    port: 7890,
    flag: true
  })
  const content = 'proxies:\n  reality-opts:\n    short-id: 001234\n'
  assert.deepEqual(
    parseYaml(
      `notes: |\n${content
        .split('\n')
        .filter(Boolean)
        .map((line) => '  ' + line)
        .join('\n')}\n`
    ),
    { notes: content }
  )
})

test('empty documents keep the default object and malformed YAML still throws', () => {
  assert.deepEqual(parseYaml(''), {})
  assert.deepEqual(parseYaml('# comment only'), {})
  for (const source of ['proxies: [', 'a: 1\na: 2', 'a: *missing']) {
    assert.throws(() => parseYaml(source))
  }
})
