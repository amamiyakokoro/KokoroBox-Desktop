import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { collectLicenses, packageRoot } from './third-party-licenses.ts'

function fixture(run: (root: string) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kokoro-licenses-'))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function pkg(root: string, name: string, dependencies = {}, optionalDependencies = {}) {
  mkdirSync(root, { recursive: true })
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', license: 'MIT', dependencies, optionalDependencies })
  )
}

test('collects transitive licenses and notices once and ignores absent optional platforms', () =>
  fixture((root) => {
    pkg(root, 'parent', { child: '*' }, { 'other-platform': '*' })
    writeFileSync(path.join(root, 'LICENSE'), 'parent license')
    const child = path.join(root, 'node_modules/child')
    pkg(child, 'child')
    writeFileSync(path.join(child, 'LICENSE.md'), 'child license')
    writeFileSync(path.join(child, 'NOTICE'), 'child attribution')
    writeFileSync(path.join(child, 'ThirdPartyNoticeText.txt'), 'embedded library attribution')
    const result = collectLicenses([root, child])
    assert.ok(result.includes('child attribution'))
    assert.ok(result.includes('embedded library attribution'))
    assert.ok(result.includes('parent license'))
    assert.equal(result.split('child@1.0.0').length, 2)
    assert.equal(result, collectLicenses([child, root]))
  }))

test('missing license text and missing required dependencies stop the build', () =>
  fixture((root) => {
    pkg(root, 'missing-license')
    assert.throws(() => collectLicenses([root]), /Missing third-party license texts/)
    writeFileSync(path.join(root, 'LICENSE'), 'license')
    pkg(root, 'missing-dependency', { missing: '*' })
    assert.throws(() => collectLicenses([root]), /Missing installed dependency/)
  }))

test('a license identifier in README is insufficient, but full MIT text is retained', () =>
  fixture((root) => {
    pkg(root, 'readme-license')
    writeFileSync(path.join(root, 'README.md'), 'License: MIT')
    assert.throws(() => collectLicenses([root]), /Missing third-party license texts/)
    writeFileSync(
      path.join(root, 'README.md'),
      'Copyright Example\nPermission is hereby granted\nSOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.'
    )
    assert.ok(collectLicenses([root]).includes('Copyright Example'))
  }))

test('finds package owner above nested module-format package.json files', () =>
  fixture((root) => {
    pkg(root, 'owner')
    mkdirSync(path.join(root, 'dist'))
    writeFileSync(path.join(root, 'dist/package.json'), '{"type":"module"}')
    assert.equal(packageRoot(path.join(root, 'dist/index.js?worker')), root)
  }))
