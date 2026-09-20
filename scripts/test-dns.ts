import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseDnsServerEndpoint, serializeDnsServerEndpoint } from '../src/shared/dns-server.ts'
import { isValidDnsServer } from '../src/renderer/src/utils/validate.ts'

test('DNS endpoint connection selector round-trips Mihomo syntax', () => {
  const proxy = parseDnsServerEndpoint('https://1.1.1.1/dns-query#PROXY&h3=true')
  assert.deepEqual(proxy, {
    address: 'https://1.1.1.1/dns-query',
    connection: 'proxy',
    proxyName: 'PROXY',
    parameters: ['h3=true']
  })
  assert.equal(serializeDnsServerEndpoint(proxy), 'https://1.1.1.1/dns-query#PROXY&h3=true')

  const rules = parseDnsServerEndpoint('https://8.8.8.8/dns-query#RULES&disable-qtype-65=true')
  assert.equal(rules.connection, 'rules')
  assert.equal(
    serializeDnsServerEndpoint(rules),
    'https://8.8.8.8/dns-query#RULES&disable-qtype-65=true'
  )
})

test('DNS endpoint validation supports current and future-safe Mihomo parameters', () => {
  assert.equal(
    isValidDnsServer(
      'https://1.1.1.1/dns-query#PROXY&name-cert-verify=cloudflare-dns.com&disable-qtype-65=true'
    ).ok,
    true
  )
  assert.equal(isValidDnsServer('https://1.1.1.1/dns-query#RULES&new-feature=value').ok, true)
  assert.equal(isValidDnsServer('https://1.1.1.1/dns-query#disable-qtype-65=maybe').ok, false)
})

test('default DNS template does not blacklist every Fake-IP mapping', () => {
  const template = readFileSync('src/main/utils/template.ts', 'utf8')
  assert.doesNotMatch(template, /'fake-ip-filter': \['\*'/)
  assert.match(template, /'fake-ip-filter-mode': 'blacklist'/)
})

test('anti-pollution preset does not assume a proxy group named PROXY', () => {
  const page = readFileSync('src/renderer/src/components/settings/network/dns-settings.tsx', 'utf8')
  assert.doesNotMatch(page, /antiPollutionDnsPreset[\s\S]*?#PROXY/)
})

test('anti-pollution DNS defaults respect rules and use redundant TLS bootstrap servers', () => {
  const page = readFileSync('src/renderer/src/components/settings/network/dns-settings.tsx', 'utf8')

  assert.match(page, /respectRules: true/)
  assert.match(page, /defaultNameserver: \['tls:\/\/223\.5\.5\.5', 'tls:\/\/119\.29\.29\.29'\]/)
  assert.match(page, /values\.respectRules === antiPollutionDnsPreset\.respectRules/)
})

test('global DNS rule routing hides redundant per-server connection selectors', () => {
  const component = readFileSync('src/renderer/src/components/dns/dns-server-list.tsx', 'utf8')
  const page = readFileSync('src/renderer/src/components/settings/network/dns-settings.tsx', 'utf8')
  const advanced = readFileSync('src/renderer/src/components/dns/advanced-dns-setting.tsx', 'utf8')

  assert.match(component, /followRoutingRules = false/)
  assert.match(component, /!ipOnly && !followRoutingRules/)
  assert.match(page, /followRoutingRules=\{values\.respectRules\}/)
  assert.match(advanced, /followRoutingRules=\{respectRules\}/)
})

test('DNS settings use sectioned, container-responsive list editors', () => {
  const page = readFileSync('src/renderer/src/components/settings/network/dns-settings.tsx', 'utf8')
  const advanced = readFileSync(
    'src/renderer/src/components/dns/advanced-dns-setting.tsx',
    'utf8'
  )
  const servers = readFileSync('src/renderer/src/components/dns/dns-server-list.tsx', 'utf8')
  const editor = readFileSync(
    'src/renderer/src/components/base/base-list-editor.tsx',
    'utf8'
  )
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')

  assert.match(
    page,
    /<FeatureSettingsSection[\s\S]*?title=\{tr\('DNS behavior'\)\}[\s\S]*?action=\{embedded \? saveButton : undefined\}/
  )
  assert.match(page, /FeatureSettingsSection title=\{tr\('Fake IP settings'\)\}/)
  assert.match(page, /FeatureSettingsSection title=\{tr\('DNS servers'\)\}/)
  assert.match(advanced, /FeatureSettingsSection title=\{tr\('DNS routing'\)\}/)
  assert.match(advanced, /FeatureSettingsSection title=\{tr\('Advanced options'\)\}/)
  assert.doesNotMatch(advanced, /SettingCard|Advanced DNS settings/)

  assert.match(advanced, /layout="key-value"/)
  assert.match(advanced, /part1Label=\{tr\('Domain or rule'\)\}/)
  assert.match(advanced, /part2Label=\{tr\('DNS servers'\)\}/)
  assert.match(editor, /layout\?: 'inline' \| 'key-value'/)
  assert.match(editor, /editable-list-key-value__row grid min-w-0 gap-2/)
  assert.match(editor, /data-new-item=\{isExtra \|\| undefined\}/)

  const keyValueBranch = editor.slice(
    editor.indexOf('if (isKeyValueLayout)'),
    editor.indexOf("'flex min-w-0 items-center gap-2'")
  )
  assert.doesNotMatch(keyValueBranch, />:<\/span>/)
  assert.doesNotMatch(keyValueBranch, /w-1\/3/)

  assert.match(servers, /dns-server-list__row grid min-w-0 items-end gap-2/)
  assert.doesNotMatch(servers, /flex-wrap/)
  assert.doesNotMatch(servers, /className="w-30"/)
  assert.match(servers, /controlWidth="select"/)
  assert.match(servers, /variant="ghost"/)
  assert.match(servers, /text-danger\/70/)
  assert.doesNotMatch(servers, /text-warning/)

  assert.match(styles, /\.editable-list-key-value,[\s\S]*\.dns-server-list \{[\s\S]*container-type: inline-size/)
  assert.match(styles, /@container \(min-width: 36rem\)/)
  assert.match(styles, /minmax\(10rem, 0\.8fr\) minmax\(16rem, 1\.8fr\) auto/)
  assert.match(styles, /minmax\(16rem, 1fr\) minmax\(10rem, 14rem\) auto/)

  for (const source of [page, advanced, servers]) {
    assert.doesNotMatch(source, /\bw-(?:28|30|32)\b|w-\[40%\]/)
  }
  assert.match(page, /controlWidth="full"/)
  assert.match(advanced, /controlWidth="short"/)
  assert.match(advanced, /controlWidth="select"/)

  assert.match(page, /useUnsavedChangesGuard/)
  assert.match(page, /restartCore\(\)/)
  assert.match(advanced, /isValidDnsServer/)
  assert.match(advanced, /isValidDomainWildcard/)
})
