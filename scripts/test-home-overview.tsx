import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  OverviewConnectionChip,
  OverviewRoutingChips,
  OverviewServiceChips,
  OverviewStatusLine,
  OverviewSubscriptionChips,
  OverviewUsageSummary
} from '../src/renderer/src/components/home/overview-parts.tsx'
import { configuredOverviewServiceFeatures } from '../src/renderer/src/utils/home-overview.ts'

test('routing renders mode and dynamic selection as separate compact chips', () => {
  const rules = renderToStaticMarkup(<OverviewRoutingChips mode="rule" activeRoutes={0} />)
  assert.match(rules, />Rules<\/span>/)
  assert.match(rules, />Dynamic<\/span>/)
  assert.equal((rules.match(/data-slot="chip"/g) ?? []).length, 2)

  const active = renderToStaticMarkup(<OverviewRoutingChips mode="rule" activeRoutes={3} />)
  assert.match(active, />3 active routes<\/span>/)
  assert.doesNotMatch(active, /Dynamic/)

  const direct = renderToStaticMarkup(<OverviewRoutingChips mode="direct" activeRoutes={0} />)
  assert.equal((direct.match(/data-slot="chip"/g) ?? []).length, 1)

  const global = renderToStaticMarkup(<OverviewRoutingChips mode="global" activeRoutes={0} />)
  assert.match(global, /Global/)
  assert.match(global, /Unavailable/)
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
  assert.equal(renderToStaticMarkup(<OverviewUsageSummary usage={0} quota={0} />), '')
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

test('configured Service features include the protected application count', () => {
  const features = configuredOverviewServiceFeatures({
    serviceRunning: true,
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
  const html = renderToStaticMarkup(<OverviewServiceChips features={features} />)
  for (const text of ['Proxy', 'DNS', 'App routing 2']) {
    assert.match(html, new RegExp(`>${text}<`))
  }
  assert.deepEqual(
    configuredOverviewServiceFeatures({
      serviceRunning: false,
      proxyEnabled: true,
      dnsConfigured: true,
      platform: 'darwin',
      tunEnabled: true,
      coreRunning: true,
      appRoutingRunning: true
    }),
    []
  )
  assert.equal(renderToStaticMarkup(<OverviewServiceChips features={[]} />), '')
})

test('connection count displays zero and handles missing data', () => {
  assert.match(renderToStaticMarkup(<OverviewConnectionChip count={0} />), /0 connections/)
  assert.match(renderToStaticMarkup(<OverviewConnectionChip />), />Connections<svg/)
})
