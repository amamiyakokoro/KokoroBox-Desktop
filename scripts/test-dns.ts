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
  const page = readFileSync('src/renderer/src/pages/dns.tsx', 'utf8')
  assert.doesNotMatch(page, /antiPollutionDnsPreset[\s\S]*?#PROXY/)
})
