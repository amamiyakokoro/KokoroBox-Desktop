import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { KokoroBrandLink } from '../src/renderer/src/components/base/kokoro-brand-link.tsx'

test('expanded and compact KokoroBox brand links navigate to Home', () => {
  for (const compact of [false, true]) {
    const link = KokoroBrandLink({ compact })
    assert.equal(link.props.to, '/')
    assert.equal(link.props['aria-label'], 'Home')
    assert.match(link.props.className, /app-nodrag/)
    const children = link.props.children as Array<{ type: unknown; props: { children?: string } }>
    assert.equal(typeof children[0].type, 'function')
    if (!compact) assert.equal(children[1].props.children, 'KokoroBox')
  }
})

test('Home owns the index route and contains no duplicate quick controls', () => {
  const routes = readFileSync('src/renderer/src/routes/index.tsx', 'utf8')
  const home = readFileSync('src/renderer/src/pages/home.tsx', 'utf8')
  assert.match(routes, /index: true,\s*element: startupRoute\(<Home \/>\)/)
  assert.doesNotMatch(
    home,
    /<Switch|<KokoSegmentedControl|patchControledMihomoConfig|triggerSysProxy/
  )
  const flags = readFileSync('src/renderer/src/components/base/country-flag.tsx', 'utf8')
  assert.doesNotMatch(flags, /hatscripts\.github\.io|https?:\/\//)
})
