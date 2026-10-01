import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { parseDnsServerEndpoint, serializeDnsServerEndpoint } from '../src/shared/dns-server.ts'
import { applyDnsPreset, getDnsPreset, getDnsPresetMode } from '../src/shared/dns-presets.ts'
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
  const preset = getDnsPreset('anti-pollution')
  assert.doesNotMatch(JSON.stringify(preset), /#PROXY/)
})

test('anti-pollution DNS defaults respect rules and use redundant TLS bootstrap servers', () => {
  const preset = getDnsPreset('anti-pollution')
  assert.equal(preset.respectRules, true)
  assert.deepEqual(preset.defaultNameserver, ['tls://223.5.5.5', 'tls://119.29.29.29'])
  assert.equal(getDnsPresetMode(preset), 'anti-pollution')
})

test('overseas DNS uses Cloudflare and Google bootstrap, DoH and DoT for all resolver roles', () => {
  const preset = getDnsPreset('overseas')
  assert.deepEqual(preset.defaultNameserver, ['1.1.1.1', '8.8.8.8'])
  for (const server of preset.defaultNameserver)
    assert.equal(isValidDnsServer(server, true).ok, true)
  const encrypted = [
    'https://cloudflare-dns.com/dns-query',
    'https://dns.google/dns-query',
    'tls://one.one.one.one',
    'tls://dns.google'
  ]
  for (const servers of [
    preset.nameserver,
    preset.proxyServerNameserver,
    preset.directNameserver
  ]) {
    assert.deepEqual(servers, encrypted)
    for (const server of servers) assert.equal(isValidDnsServer(server).ok, true, server)
  }
  assert.equal(preset.respectRules, false)
  assert.equal(preset.directNameserverFollowPolicy, false)
  assert.deepEqual(preset.nameserverPolicy, { '+.arpa': ['system'] })
  assert.equal(getDnsPresetMode(preset), 'overseas')
})

test('switching DNS presets clears previous routing and fallback while preserving unrelated settings', () => {
  const current = {
    ...getDnsPreset('anti-pollution'),
    fallback: ['https://dns.alidns.com/dns-query'],
    fallbackFilter: { geoip: true, 'geoip-code': 'CN' },
    fallbackLazyQuery: true,
    proxyServerNameserverPolicy: { 'geosite:cn': ['223.5.5.5'] },
    ipv6: true,
    hosts: [{ domain: 'custom.local', value: '192.168.1.2' }],
    fakeIPRange: '198.18.0.1/16',
    preferH3: true
  }
  const overseas = applyDnsPreset(current, 'overseas')
  assert.equal(getDnsPresetMode(overseas), 'overseas')
  assert.deepEqual(overseas.fallback, [])
  assert.deepEqual(overseas.fallbackFilter, {})
  assert.equal(overseas.fallbackLazyQuery, false)
  assert.deepEqual(overseas.proxyServerNameserverPolicy, {})
  assert.equal(overseas.ipv6, true)
  assert.deepEqual(overseas.hosts, current.hosts)
  assert.equal(overseas.fakeIPRange, current.fakeIPRange)
  assert.equal(overseas.preferH3, true)
  assert.ok('geosite:cn' in current.nameserverPolicy)
  assert.deepEqual(current.fallback, ['https://dns.alidns.com/dns-query'])
  const antiPollution = applyDnsPreset(overseas, 'anti-pollution')
  assert.equal(getDnsPresetMode(antiPollution), 'anti-pollution')
  assert.equal(antiPollution.respectRules, true)
  assert.ok('geosite:cn' in antiPollution.nameserverPolicy)
  assert.equal(getDnsPresetMode(applyDnsPreset(antiPollution, 'overseas')), 'overseas')
})

test('preset detection survives serialization and recognizes edited resolver policies', () => {
  for (const mode of ['anti-pollution', 'overseas'] as const) {
    const preset = getDnsPreset(mode)
    const restored = parse(stringify(preset))
    restored.nameserverPolicy = Object.fromEntries(
      Object.entries(restored.nameserverPolicy).reverse()
    )
    assert.equal(getDnsPresetMode(restored), mode)
    restored.proxyServerNameserverPolicy = { '+.example.com': ['9.9.9.9'] }
    assert.equal(getDnsPresetMode(restored), 'custom')
    assert.equal(getDnsPresetMode({ ...preset, nameserver: ['9.9.9.9'] }), 'custom')
    assert.equal(getDnsPresetMode({ ...preset, fakeIPFilter: ['*'] }), 'custom')
  }
})

test('DNS preset drafts and resolver roles have independent mutable lists', () => {
  const preset = getDnsPreset('overseas')
  preset.nameserver.push('9.9.9.9')
  preset.fakeIPFilter.push('+.example.com')
  assert.equal(preset.directNameserver.includes('9.9.9.9'), false)
  assert.equal(getDnsPreset('overseas').nameserver.includes('9.9.9.9'), false)
  assert.equal(getDnsPreset('overseas').fakeIPFilter.includes('+.example.com'), false)
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
  const advanced = readFileSync('src/renderer/src/components/dns/advanced-dns-setting.tsx', 'utf8')
  const servers = readFileSync('src/renderer/src/components/dns/dns-server-list.tsx', 'utf8')
  const editor = readFileSync('src/renderer/src/components/base/base-list-editor.tsx', 'utf8')
  const registry = readFileSync('src/renderer/src/components/settings/settings-schema.ts', 'utf8')
  const styles = readFileSync('src/renderer/src/assets/app-overrides.css', 'utf8')

  assert.match(
    page,
    /<FeatureSettingsPanelAction action=\{embedded \? saveButton : undefined\} \/>/
  )
  assert.match(page, /FeatureSettingsSection title=\{tr\('DNS behavior'\)\}/)
  assert.match(page, /FeatureSettingsSection title=\{tr\('Fake IP settings'\)\}/)
  assert.match(page, /FeatureSettingsSection title=\{tr\('DNS servers'\)\}/)
  assert.match(advanced, /FeatureSettingsSection title=\{tr\('DNS routing'\)\}/)
  assert.match(advanced, /FeatureSettingsSection title=\{tr\('Advanced options'\)\}/)
  assert.match(advanced, /<Disclosure/)
  assert.match(advanced, /<Disclosure\.Trigger/)
  assert.match(advanced, /<Disclosure\.Indicator/)
  assert.match(advanced, /<Disclosure\.Content>/)
  assert.match(advanced, /useState\(Boolean\(expandForSetting\)\)/)
  assert.match(advanced, /if \(expandForSetting\) setIsExpanded\(true\)/)
  assert.match(advanced, /tr\('Advanced DNS settings'\)/)
  assert.match(advanced, /data-setting-label=\{tr\('Advanced DNS settings'\)\}/)
  assert.doesNotMatch(advanced, /SettingCard|data-slot/)
  assert.match(page, /Object\.values\(advancedDnsSettingIds\)\.some/)
  assert.match(page, /expandForSetting=\{advancedSetting\}/)
  assert.match(registry, /advancedDnsSettingIds\.routingRules/)
  assert.match(registry, /advancedDnsSettingIds\.customHosts/)

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

  assert.match(
    styles,
    /\.editable-list-key-value,[\s\S]*\.dns-server-list \{[\s\S]*container-type: inline-size/
  )
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
