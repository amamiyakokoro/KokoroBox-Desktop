import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import { parseDependencyNotices, sysproxyBuildVersion } from '../src/shared/about.ts'

test('dependency notices retain scoped names, installed versions and license document IDs', () => {
  assert.deepEqual(
    parseDependencyNotices(
      '@scope/library@1.2.3\r\nLicense: MIT\r\nSource: example\n\nText\n',
      'renderer'
    ),
    [{ name: '@scope/library', version: '1.2.3', license: 'MIT', document: 'renderer' }]
  )
  assert.deepEqual(parseDependencyNotices('README MIT', 'renderer'), [])
})

test('sysproxy version uses actual Go module replacement and supports v2 module paths', () => {
  assert.equal(
    sysproxyBuildVersion(
      'binary data\ndep\tgithub.com/upstream/sysproxy-go\tv1.0.0\th1:abc\n=>\tgithub.com/amamiyakokoro/sysproxy-go\tv1.0.4\th1:def\n'
    ),
    'v1.0.4'
  )
  assert.equal(
    sysproxyBuildVersion('dep\tgithub.com/amamiyakokoro/sysproxy-go/v2\tv2.0.1-abc\th1:xyz\n'),
    'v2.0.1-abc'
  )
  assert.equal(sysproxyBuildVersion('github.com/amamiyakokoro/sysproxy-go/v2'), undefined)
})

test('central license backups exist and the application/flag licenses retain their full text', () => {
  for (const name of [
    'Sparkle',
    'ProxyBridge',
    'WinDivert',
    'sysproxy-go',
    'CloudflareSpeedtest'
  ]) {
    assert.ok(existsSync(`licenses/LICENSE.${name}`))
  }
  assert.equal(readFileSync('licenses/LICENSE.KokoroBox', 'utf8'), readFileSync('LICENSE', 'utf8'))
  assert.equal(
    readFileSync('licenses/LICENSE.circle-flags', 'utf8'),
    readFileSync('src/renderer/src/assets/circle-flags/LICENSE.md', 'utf8')
  )
})
