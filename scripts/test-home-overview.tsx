import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  OverviewConnectionChip,
  OverviewPublicIp,
  OverviewRoutingChips,
  OverviewConfiguredChips,
  OverviewStatusLine,
  OverviewSubscriptionChips,
  OverviewUsageSummary
} from '../src/renderer/src/components/home/overview-parts.tsx'
import {
  overviewTrafficPaths,
  overviewTrafficState
} from '../src/renderer/src/components/home/overview-traffic-chart.tsx'
import { configuredOverviewFeatures } from '../src/renderer/src/utils/home-overview.ts'

test('routing renders mode and dynamic selection as separate compact chips', () => {
  const rules = renderToStaticMarkup(<OverviewRoutingChips mode="rule" />)
  assert.match(rules, />Rules<\/span>/)
  assert.match(rules, />Dynamic<\/span>/)
  assert.equal((rules.match(/data-slot="chip"/g) ?? []).length, 2)

  const direct = renderToStaticMarkup(<OverviewRoutingChips mode="direct" />)
  assert.equal((direct.match(/data-slot="chip"/g) ?? []).length, 1)

  const global = renderToStaticMarkup(<OverviewRoutingChips mode="global" />)
  assert.match(global, /Global/)
  assert.equal((global.match(/data-slot="chip"/g) ?? []).length, 1)
})

test('masked public IP does not leak through title or accessibility text', () => {
  const hidden = renderToStaticMarkup(
    <OverviewPublicIp ip="58.153.67.47" revealed={false} onToggle={() => {}} />
  )
  assert.match(hidden, /58\.153\.\*\*\.47/)
  assert.doesNotMatch(hidden, /58\.153\.67\.47/)
  assert.match(hidden, /aria-label="Reveal IP address"/)

  const shown = renderToStaticMarkup(
    <OverviewPublicIp ip="58.153.67.47" revealed onToggle={() => {}} />
  )
  assert.match(shown, /58\.153\.67\.47/)
  assert.match(shown, /aria-pressed="true"/)

  const hiddenV6 = renderToStaticMarkup(
    <OverviewPublicIp ip="2001:db8:1234:5678::1" revealed={false} onToggle={() => {}} />
  )
  assert.doesNotMatch(hiddenV6, /2001:db8:1234:5678::1/)
})

test('subscription identity uses Kokoro, protocol and route chips', () => {
  const profile = {
    id: 'kokoro',
    name: 'Kokoro Hong Kong',
    type: 'remote',
    kokoro: { settings: { protocol: 'anytls', mode: 'direct' } }
  } as ProfileItem
  const html = renderToStaticMarkup(<OverviewSubscriptionChips profile={profile} />)
  assert.match(html, /chip--accent/)
  for (const text of ['Kokoro', 'ANYTLS', 'Direct']) assert.match(html, new RegExp(`>${text}<`))
  assert.equal((html.match(/data-slot="chip"/g) ?? []).length, 3)
})

test('usage keeps the percentage, meter and remaining quota together', () => {
  const html = renderToStaticMarkup(<OverviewUsageSummary usage={35} quota={100} />)
  assert.match(html, /35% used/)
  assert.match(html, /65\.00 B remaining/)
  assert.match(html, /data-slot="meter"/)
  assert.doesNotMatch(html, /data-slot="chip"/)
  assert.equal(renderToStaticMarkup(<OverviewUsageSummary usage={0} quota={0} />), '')
  const exceeded = renderToStaticMarkup(<OverviewUsageSummary usage={120} quota={100} />)
  assert.match(exceeded, /120% used/)
  assert.match(exceeded, /0\.00 B remaining/)
  assert.match(exceeded, /bg-danger/)
})

test('service status has a semantic indicator independent of Mihomo runtime', () => {
  const html = renderToStaticMarkup(
    <OverviewStatusLine
      label="KokoroBox Service"
      status="Running"
      tone="success"
      version="v0.6.0"
    />
  )
  assert.match(html, /KokoroBox Service/)
  assert.match(html, /Running/)
  assert.match(html, /v0\.6\.0/)
  assert.match(html, /bg-success/)
  assert.doesNotMatch(html, /Direct run|System service/)
})

test('configured features include application routing independently of Service state', () => {
  const features = configuredOverviewFeatures({
    proxyEnabled: true,
    dnsConfigured: true,
    platform: 'darwin',
    tunEnabled: true,
    coreRunning: true,
    appRoutingRunning: true,
    protectedApplicationCount: 2
  })
  assert.deepEqual(features, [
    { kind: 'proxy' },
    { kind: 'dns' },
    { kind: 'app-routing', count: 2 }
  ])
  const html = renderToStaticMarkup(<OverviewConfiguredChips features={features} />)
  for (const text of ['Proxy', 'DNS', 'App routing 2']) {
    assert.match(html, new RegExp(`>${text}<`))
  }
  assert.deepEqual(
    configuredOverviewFeatures({
      proxyEnabled: false,
      dnsConfigured: false,
      platform: 'darwin',
      tunEnabled: false,
      coreRunning: false,
      appRoutingRunning: false
    }),
    []
  )
  assert.deepEqual(
    configuredOverviewFeatures({
      proxyEnabled: false,
      dnsConfigured: false,
      platform: 'darwin',
      tunEnabled: false,
      coreRunning: false,
      appRoutingRunning: true,
      protectedApplicationCount: 1
    }),
    [{ kind: 'app-routing', count: 1 }]
  )
  assert.equal(renderToStaticMarkup(<OverviewConfiguredChips features={[]} />), '')
})

test('connection count displays zero and handles missing data', () => {
  assert.match(renderToStaticMarkup(<OverviewConnectionChip count={0} />), /0 connections/)
  assert.match(renderToStaticMarkup(<OverviewConnectionChip count={1} />), /1 connection/)
  assert.doesNotMatch(renderToStaticMarkup(<OverviewConnectionChip count={1} />), /1 connections/)
  assert.match(renderToStaticMarkup(<OverviewConnectionChip />), />Connections<svg/)
})

test('traffic history uses actual download and upload samples without synthetic points', () => {
  assert.deepEqual(overviewTrafficPaths([]), { down: '', up: '' })
  assert.equal(overviewTrafficState([]), 'unavailable')
  assert.equal(overviewTrafficState([{ index: 1, down: 0, up: 0 }]), 'idle')
  const paths = overviewTrafficPaths([
    { index: 1, down: 10, up: 0 },
    { index: 2, down: 20, up: 5 }
  ])
  assert.equal((paths.down.match(/[ML]/g) ?? []).length, 2)
  assert.equal((paths.up.match(/[ML]/g) ?? []).length, 2)
  assert.notEqual(paths.down, paths.up)
  assert.equal(overviewTrafficState([{ index: 2, down: 20, up: 5 }]), 'active')
})
