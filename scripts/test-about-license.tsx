import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LicenseDocument } from '../src/renderer/src/components/settings/license-document.tsx'
import { resolveLicenseDocumentLink } from '../src/shared/about'

const documents = [
  { id: 'notices', name: 'THIRD_PARTY_NOTICES.md' },
  { id: '0:LICENSE.Sparkle', name: 'LICENSE.Sparkle' },
  { id: '0:README.md', name: 'README.md' },
  { id: '0:icons/feather.txt', name: 'icons/feather.txt' }
]

test('third-party notices render as headings, a table, code and links', () => {
  const html = renderToStaticMarkup(
    <LicenseDocument
      text={readFileSync('THIRD_PARTY_NOTICES.md', 'utf8')}
      name="THIRD_PARTY_NOTICES.md"
      title="THIRD_PARTY_NOTICES.md"
      documents={documents}
      onOpenDocument={() => {}}
    />
  )
  assert.match(html, /<h1>Third-party notices<\/h1>/)
  assert.match(html, /<table>/)
  assert.match(html, /<th>Component<\/th>/)
  assert.equal((html.match(/<tr>/g) || []).length, 10)
  assert.match(html, /<code>LICENSE\.Sparkle<\/code>/)
  assert.match(html, /<button type="button" title="LICENSE\.Sparkle">License<\/button>/)
  assert.match(html, /href="https:\/\/github\.com\/sparkle-project\/Sparkle" target="_blank"/)
  assert.doesNotMatch(html, /<pre>|\| Component/)
})

test('plain-text package licenses retain their formatting and selected package section', () => {
  const text = ['first@1.0\nMIT\n**Literal text**\n  Indented', 'second@2.0\nOther license'].join(
    '\n\n' + '='.repeat(80) + '\n\n'
  )
  const html = renderToStaticMarkup(
    <LicenseDocument
      text={text}
      name="renderer.txt"
      title="first@1.0"
      documents={documents}
      onOpenDocument={() => {}}
    />
  )
  assert.match(html, /<pre[^>]*>first@1.0\nMIT\n\*\*Literal text\*\*\n {2}Indented<\/pre>/)
  assert.doesNotMatch(html, /second@2.0|<strong>/)
})

test('relative notice links open the matching bundled license across document directories', () => {
  assert.equal(
    resolveLicenseDocumentLink('THIRD_PARTY_NOTICES.md', 'licenses/LICENSE.Sparkle', documents),
    documents[1]
  )
  assert.equal(
    resolveLicenseDocumentLink('README.md', './LICENSE.Sparkle', documents),
    documents[1]
  )
  assert.equal(
    resolveLicenseDocumentLink('icons/help.md', '../LICENSE.Sparkle', documents),
    documents[1]
  )
  assert.equal(
    resolveLicenseDocumentLink('README.md', 'icons/feather.txt', documents),
    documents[3]
  )
  for (const href of [
    'https://example.com/LICENSE.Sparkle',
    '//example.com',
    '../../LICENSE.Sparkle',
    'licenses/missing',
    '#heading'
  ]) {
    assert.equal(resolveLicenseDocumentLink('THIRD_PARTY_NOTICES.md', href, documents), undefined)
  }
})

test('Markdown content does not load remote images or render raw HTML and unsafe URLs', () => {
  const html = renderToStaticMarkup(
    <LicenseDocument
      text={
        '<script>alert(1)</script>\n\n[unsafe](javascript:alert%281%29)\n\n![image](https://example.com/image.png)'
      }
      name="README.md"
      title="README.md"
      documents={documents}
      onOpenDocument={() => {}}
    />
  )
  assert.doesNotMatch(html, /<script|javascript:|<img|image\.png/)
  assert.match(html, /unsafe/)
})
