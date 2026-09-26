import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fullLogText,
  getLogActionDetails,
  logDomain,
  logRulePayload,
  prependLogRule
} from '../src/renderer/src/components/logs/log-actions.ts'
import { validateRules } from '../src/renderer/src/utils/kokoro-rule-validation.ts'
import { connectionRuleDetails } from '../src/renderer/src/components/connections/connection-rule-details.ts'

test('connection rules use host metadata and the real process name with both domain types', () => {
  const details = connectionRuleDetails({
    host: 'api.example.co.uk',
    sniffHost: 'other.example.net',
    process: 'browser.exe',
    processPath: 'C:\\Apps\\Different.exe'
  })
  assert.equal(logRulePayload(details, 'DOMAIN-SUFFIX'), 'example.co.uk')
  assert.equal(logRulePayload(details, 'DOMAIN'), 'api.example.co.uk')
  assert.equal(logRulePayload(details, 'PROCESS-NAME'), 'browser.exe')
})

test('IP-only connections recover a sniffed host and process name from platform paths', () => {
  assert.deepEqual(
    connectionRuleDetails({
      host: '1.2.3.4',
      sniffHost: 'cdn.example.com',
      process: '',
      processPath: 'C:\\Program Files\\My Browser.exe'
    }),
    { domain: 'cdn.example.com', process: 'My Browser.exe' }
  )
  assert.deepEqual(
    connectionRuleDetails({
      host: '',
      sniffHost: '',
      process: '',
      processPath: '/usr/bin/firefox'
    }),
    { domain: undefined, process: 'firefox' }
  )
  assert.deepEqual(
    connectionRuleDetails({ host: '::1', sniffHost: '', process: '', processPath: '' }),
    { domain: undefined, process: undefined }
  )
})

test('suffix rules use registrable domains while DOMAIN keeps the full hostname', () => {
  for (const [domain, suffix] of [
    ['api.example.com', 'example.com'],
    ['cdn.api.example.co.uk', 'example.co.uk'],
    ['api.example.com.tw', 'example.com.tw'],
    ['example.com', 'example.com'],
    ['a.b.example.unknownsuffix', 'a.b.example.unknownsuffix'],
    ['a.b.internal.local', 'a.b.internal.local'],
    ['cdn.project.github.io', 'project.github.io'],
    ['a.b.blogspot.com', 'b.blogspot.com'],
    ['www.city.kawasaki.jp', 'city.kawasaki.jp']
  ]) {
    assert.equal(logRulePayload({ domain }, 'DOMAIN-SUFFIX'), suffix)
    assert.equal(logRulePayload({ domain }, 'DOMAIN'), domain)
  }
})

test('switching rule types preserves the original hostname and process source', () => {
  const details = { domain: 'Api.Example.co.uk.', process: 'browser.exe' }
  assert.equal(logRulePayload(details, 'DOMAIN-SUFFIX'), 'example.co.uk')
  assert.equal(logRulePayload(details, 'DOMAIN'), 'api.example.co.uk')
  assert.equal(logRulePayload(details, 'PROCESS-NAME'), 'browser.exe')
  assert.equal(logRulePayload(details, 'DOMAIN-SUFFIX'), 'example.co.uk')
  assert.equal(details.domain, 'Api.Example.co.uk.')
  assert.equal(logRulePayload({}, 'DOMAIN'), '')
  assert.equal(logRulePayload({ domain: '1.2.3.4' }, 'DOMAIN-SUFFIX'), '')
  assert.equal(logRulePayload({ domain: 'co.uk' }, 'DOMAIN-SUFFIX'), '')
  assert.equal(logRulePayload({ domain: 'github.io' }, 'DOMAIN-SUFFIX'), '')
})

test('connection actions extract endpoints and process without routing metadata', () => {
  assert.deepEqual(
    getLogActionDetails(
      '[TCP] 127.0.0.1:51390(firefox.exe) --> ChatGPT.com:443 match RuleSet(other.com) using Proxy'
    ),
    {
      process: 'firefox.exe',
      destination: 'ChatGPT.com:443',
      domain: 'chatgpt.com'
    }
  )
  assert.deepEqual(
    getLogActionDetails('[UDP] [::1]:1234(My Browser.exe) --> [2001:db8::1]:443 using DIRECT'),
    {
      process: 'My Browser.exe',
      destination: '[2001:db8::1]:443',
      domain: undefined
    }
  )
  assert.deepEqual(
    getLogActionDetails('[TCP] 192.168.1.2:1234 --> 1.1.1.1:443 match Domain(example.com)'),
    {
      process: undefined,
      destination: '1.1.1.1:443',
      domain: undefined
    }
  )
})

test('generic and DNS messages do not mistake rule names for process or destination', () => {
  for (const message of [
    'DNS lookup example.com failed',
    'match RuleSet(example.com) using DIRECT',
    '[TCP] connection failed (timeout)'
  ]) {
    assert.deepEqual(getLogActionDetails(message), {})
  }
})

test('domain rules require a hostname, not an IP, URL, port or rule injection', () => {
  for (const value of [
    '1.2.3.4',
    '[::1]',
    'https://example.com/path',
    'example.com:443',
    'example.com,REJECT',
    '*.com',
    'example.com\n'
  ]) {
    assert.equal(logDomain(value), undefined)
  }
  assert.equal(logDomain('Api.Example.co.uk.'), 'api.example.co.uk')
})

test('whole log copies preserve timestamp, level and the full unmodified message', () => {
  assert.equal(
    fullLogText({ time: '2026-09-26T12:30:00Z', type: 'warning', payload: 'first\nsecond' }),
    '2026-09-26T12:30:00Z [WARNING] first\nsecond'
  )
})

test('quick rules precede existing matches, preserve existing rules, and are idempotent', () => {
  const current = [{ type: 'MATCH', payload: null, target: 'DIRECT' }] as KokoroCustomRuleInput[]
  const rule: KokoroCustomRuleInput = {
    type: 'DOMAIN-SUFFIX',
    payload: 'example.com',
    target: 'Proxy'
  }
  const next = prependLogRule(current, rule)
  assert.deepEqual(next, [rule, ...current])
  assert.equal(current.length, 1)
  assert.equal(prependLogRule(next, rule), next)
})

test('quick rules share server option, payload and capacity validation with the editor', () => {
  const options: KokoroCustomRulesOptions = {
    schema_version: 1,
    rule_types: ['PROCESS-NAME'],
    targets: ['DIRECT'],
    rule_providers: [],
    limits: { max_rules_per_set: 1 }
  }
  const rule: KokoroCustomRuleInput = {
    type: 'PROCESS-NAME',
    payload: 'My Browser.exe',
    target: 'DIRECT'
  }
  assert.equal(validateRules([rule], options), null)
  assert.ok(validateRules([{ ...rule, target: 'not-available' }], options))
  assert.ok(validateRules([{ ...rule, payload: 'browser.exe,REJECT' }], options))
  assert.ok(validateRules([rule, rule], options))
})
