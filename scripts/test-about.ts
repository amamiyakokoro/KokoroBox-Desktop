import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import {
  ABOUT_COMPONENTS,
  aboutComponents,
  licenseProjectForDocument,
  parseDependencyNotices,
  sysproxyBuildVersion
} from '../src/shared/about.ts'

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
    'KokoroBoxService',
    'KokoroBoxNative',
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

test('component versions link only to their own available offline license documents', () => {
  const documents = ABOUT_COMPONENTS.map((item, index) => ({
    id: `${index}:${item.documentName}`,
    name: item.documentName
  }))
  const components = aboutComponents({
    app: '4.26.9-6',
    service: '0.6.5',
    native: '0.16.1',
    sysproxy: 'v2.0.1',
    electron: '44.4.2',
    chromium: '152.0.7977.130',
    node: '24.21.0',
    dependencies: [],
    documents
  })
  assert.equal(components.length, 7)
  components.forEach((item, index) => assert.equal(item.document, documents[index]))
  assert.equal(components[0].version, '0.6.5')
  assert.equal(components[3].version, 'v2.0.1')
  assert.equal(components[2].version, undefined)
  assert.ok(components[2].document, 'license remains available when the version cannot be read')
  assert.ok(aboutComponents().every((item) => !item.document))
  assert.ok(
    aboutComponents({
      app: '1',
      electron: '1',
      chromium: '1',
      node: '1',
      dependencies: [],
      documents: [{ id: 'application', name: 'LICENSE.KokoroBox' }]
    }).every((item) => !item.document),
    'do not substitute the application license for missing component licenses'
  )
})

test('standalone licenses identify the covered project while package supplements stay with their package', () => {
  assert.equal(licenseProjectForDocument('LICENSE.ProxyBridge'), 'ProxyBridge')
  assert.equal(licenseProjectForDocument('icons/font-awesome6.txt'), 'react-icons · Font Awesome 6')
  assert.equal(licenseProjectForDocument('CC-BY-SA-3.0.txt'), 'Typicons · CC-BY-SA-3.0')
  for (const name of ['main.txt', 'renderer.txt', 'README.md', '@vscode+l10n@0.0.18.txt']) {
    assert.equal(licenseProjectForDocument(name), undefined)
  }
  const documents = readdirSync('licenses', { recursive: true }).map((name) =>
    name.replaceAll('\\', '/')
  )
  for (const name of documents.filter(
    (name) => name.startsWith('icons/') && name.endsWith('.txt')
  )) {
    assert.match(licenseProjectForDocument(name) || '', /^react-icons · /)
  }
})
