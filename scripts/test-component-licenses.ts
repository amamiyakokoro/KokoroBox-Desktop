import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { electronCreditLicense, writeElectronComponentLicenses } from './component-licenses.ts'

function credit(title: string, text: string): string {
  return `<div class="product"><span class="title">${title}</span><div class="license"><pre>${text}</pre></div></div>`
}

const chromium = 'Copyright Chromium\nRedistribution &amp; use &lt;with&gt; conditions.'
const node =
  'Copyright Node.js contributors.\nMIT &#x27;license&#39; &quot;text&quot;\n\nThird-party notices: &amp;lt; is literal.'
const credits =
  '<!doctype html><html><body>' +
  credit('Unrelated', 'other') +
  credit('Node.js', node) +
  credit('The Chromium Project', chromium) +
  '</body></html>'

test('runtime license extraction retains multiline notices and decodes HTML entities once', () => {
  assert.equal(
    electronCreditLicense(credits, 'The Chromium Project'),
    'Copyright Chromium\nRedistribution & use <with> conditions.\n'
  )
  assert.equal(
    electronCreditLicense(credits, 'Node.js'),
    'Copyright Node.js contributors.\nMIT \'license\' "text"\n\nThird-party notices: &lt; is literal.\n'
  )
})

test('missing, duplicate and malformed runtime credits fail instead of producing incomplete licenses', () => {
  assert.throws(() => electronCreditLicense(credits, 'Missing'), /Expected one/)
  assert.throws(
    () => electronCreditLicense(credits + credit('Node.js', node), 'Node.js'),
    /Expected one/
  )
  for (const text of ['', '<a href="https://example.com">license</a>', 'one</pre><pre>two']) {
    assert.throws(
      () => electronCreditLicense(credit('Node.js', text), 'Node.js'),
      /Invalid Electron/
    )
  }
})

test('packaged runtime licenses come from the matching Electron artifact, including all Node notices', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kokorobox-component-licenses-'))
  try {
    const dist = path.join(root, 'dist')
    const output = path.join(root, 'licenses')
    mkdirSync(dist)
    writeFileSync(path.join(dist, 'version'), 'v44.4.2\n')
    writeFileSync(path.join(dist, 'LICENSE'), 'Full Electron MIT license\n')
    writeFileSync(path.join(dist, 'LICENSES.chromium.html'), credits)
    writeElectronComponentLicenses(dist, '44.4.2', output)
    assert.equal(
      readFileSync(path.join(output, 'LICENSE.Electron'), 'utf8'),
      'Full Electron MIT license\n'
    )
    assert.equal(
      readFileSync(path.join(output, 'LICENSE.Chromium'), 'utf8'),
      electronCreditLicense(credits, 'The Chromium Project')
    )
    assert.equal(
      readFileSync(path.join(output, 'LICENSE.Node'), 'utf8'),
      electronCreditLicense(credits, 'Node.js')
    )
    assert.throws(() => writeElectronComponentLicenses(dist, '45.0.0', output), /version mismatch/)
    writeFileSync(
      path.join(dist, 'LICENSES.chromium.html'),
      credit('The Chromium Project', chromium)
    )
    assert.throws(() => writeElectronComponentLicenses(dist, '44.4.2', output), /Expected one/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
