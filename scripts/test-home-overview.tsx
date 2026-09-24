import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  OverviewConnectionAction,
  OverviewPublicIp,
  OverviewRoutingChip,
  OverviewConfiguredChips,
  OverviewStatusLine,
  OverviewSubscriptionChips,
  OverviewUsageSummary,
  OverviewTrafficRate,
  formatOverviewBytes
} from '../src/renderer/src/components/home/overview-parts.tsx'
import {
  overviewTrafficPaths,
  overviewTrafficState
} from '../src/renderer/src/components/home/overview-traffic-chart.tsx'
import { configuredOverviewFeatures } from '../src/renderer/src/utils/home-overview.ts'
import {
  TopActiveAppContent,
  metadataForTopActiveApp,
  topActiveAppName
} from '../src/renderer/src/components/home/top-active-app.tsx'

test('routing emphasizes only its mode', () => {
  const rules = renderToStaticMarkup(<OverviewRoutingChip mode="rule" />)
  assert.match(rules, />Rules<\/span>/)
  assert.doesNotMatch(rules, /Dynamic/)
  assert.equal((rules.match(/data-slot="chip"/g) ?? []).length, 1)

  const direct = renderToStaticMarkup(<OverviewRoutingChip mode="direct" />)
  assert.equal((direct.match(/data-slot="chip"/g) ?? []).length, 1)

  const global = renderToStaticMarkup(<OverviewRoutingChip mode="global" />)
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
  assert.match(html, /Used traffic/)
  assert.match(html, /text-xl font-semibold/)
  assert.match(html, /data-slot="meter"/)
  assert.doesNotMatch(html, /data-slot="chip"/)
  assert.equal(renderToStaticMarkup(<OverviewUsageSummary usage={0} quota={0} />), '')
  const exceeded = renderToStaticMarkup(<OverviewUsageSummary usage={120} quota={100} />)
  assert.match(exceeded, /120% used/)
  assert.match(exceeded, /0 B remaining/)
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
  for (const text of ['Proxy', 'DNS', 'App routing']) {
    assert.match(html, new RegExp(`>${text}<`))
  }
  assert.match(html, />2<\/span>/)
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
  assert.match(renderToStaticMarkup(<OverviewConnectionAction count={0} />), /0 connections/)
  assert.match(renderToStaticMarkup(<OverviewConnectionAction count={1} />), /1 connection/)
  assert.doesNotMatch(renderToStaticMarkup(<OverviewConnectionAction count={1} />), /1 connections/)
  assert.match(renderToStaticMarkup(<OverviewConnectionAction />), /Connections<svg/)
  assert.doesNotMatch(
    renderToStaticMarkup(<OverviewConnectionAction count={0} />),
    /data-slot="chip"/
  )
})

test('traffic rate distinguishes zero from unavailable without false precision', () => {
  const zero = renderToStaticMarkup(<OverviewTrafficRate bytesPerSecond={0} />)
  assert.match(zero, />0<\/span>/)
  assert.match(zero, /B\/s/)
  assert.doesNotMatch(zero, /0\.00/)
  assert.equal(formatOverviewBytes(0), '0 B')
  assert.match(renderToStaticMarkup(<OverviewTrafficRate />), /—/)
})

test('traffic history uses actual download and upload samples without synthetic points', () => {
  assert.deepEqual(overviewTrafficPaths([]), { down: '', up: '' })
  assert.equal(overviewTrafficState([]), 'unavailable')
  assert.equal(overviewTrafficState([{ index: 1, down: 0, up: 0 }]), 'idle')
  assert.equal(
    overviewTrafficState([
      { index: 1, down: 10, up: 0 },
      { index: 2, down: 0, up: 0 }
    ]),
    'active'
  )
  const paths = overviewTrafficPaths([
    { index: 1, down: 10, up: 0 },
    { index: 2, down: 20, up: 5 }
  ])
  assert.equal((paths.down.match(/[ML]/g) ?? []).length, 2)
  assert.equal((paths.up.match(/[ML]/g) ?? []).length, 2)
  assert.notEqual(paths.down, paths.up)
  assert.equal(overviewTrafficState([{ index: 2, down: 20, up: 5 }]), 'active')
})

test('Top active app displays the host name, local icon, sampled directions and navigation', () => {
  const application = {
    key: 'application:/Applications/Discord.app',
    name: 'Discord',
    lookupPath: '/Applications/Discord.app',
    kind: 'application' as const,
    downloadSpeed: 2048,
    uploadSpeed: 0
  }
  const html = renderToStaticMarkup(
    <TopActiveAppContent
      application={application}
      metadata={{ name: 'Discord', iconUrl: 'data:image/png;base64,AA==' }}
      sampleSeconds="0.5"
      explanation="Connection sample"
    />
  )
  assert.match(html, /Top active app/)
  assert.match(html, /0\.5 s sample/)
  assert.match(html, /src="data:image\/png;base64,AA==" alt=""/)
  assert.match(html, /object-contain/)
  assert.match(html, /Discord/)
  assert.match(html, /KB\/s/)
  assert.match(html, /B\/s/)
  assert.match(html, /min-w-0/)
  assert.equal(topActiveAppName(application, { name: 'Discord' }), 'Discord')
  assert.equal(topActiveAppName(application, undefined), 'Discord')
  assert.equal(
    metadataForTopActiveApp(application, {
      key: 'application:/Applications/Discord Canary.app',
      value: { name: 'Discord Canary' }
    }),
    undefined
  )
  const fallback = renderToStaticMarkup(
    <TopActiveAppContent
      application={application}
      sampleSeconds="0.5"
      explanation="Connection sample"
    />
  )
  assert.doesNotMatch(fallback, /<img/)
  assert.match(fallback, /Discord/)
})
