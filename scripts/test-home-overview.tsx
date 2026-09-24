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
  OverviewSubscriptionIdentity,
  OverviewUsageSummary,
  OverviewTrafficRate,
  formatOverviewBytes
} from '../src/renderer/src/components/home/overview-parts.tsx'
import {
  OverviewTrafficChart,
  overviewTrafficAreaPaths,
  overviewTrafficPaths,
  overviewTrafficRangeSeconds,
  overviewTrafficMaximumSamples,
  overviewTrafficRetentionMs,
  overviewTrafficState,
  parseOverviewTrafficHistory,
  pruneOverviewTrafficHistory
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

  const identity = renderToStaticMarkup(<OverviewSubscriptionIdentity profile={profile} />)
  assert.match(identity, /aria-hidden="true"/)
  assert.match(identity, /size-11 shrink-0/)
  assert.match(identity, /line-clamp-2 break-words/)
  assert.match(identity, /min-w-0 flex-1/)
  assert.match(identity, /Kokoro Hong Kong/)
  assert.equal((identity.match(/data-slot="chip"/g) ?? []).length, 3)
})

test('usage keeps the percentage, meter and remaining quota together', () => {
  const html = renderToStaticMarkup(<OverviewUsageSummary usage={35} quota={100} />)
  assert.match(html, /35% used/)
  assert.match(html, /65\.00 B remaining/)
  assert.match(html, /Used traffic/)
  assert.match(html, /text-2xl font-semibold/)
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
  assert.deepEqual(overviewTrafficAreaPaths([]), { down: '', up: '' })
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
  const areaPaths = overviewTrafficAreaPaths([
    { index: 1_000, down: 10, up: 5 },
    { index: 2_000, down: 20, up: 10 },
    { index: 10_000, down: 15, up: 7 },
    { index: 11_000, down: 5, up: 2 }
  ])
  assert.equal((areaPaths.down.match(/Z/g) ?? []).length, 2)
  assert.equal((areaPaths.up.match(/Z/g) ?? []).length, 2)
  const chart = renderToStaticMarkup(<OverviewTrafficChart data={[]} />)
  assert.match(chart, /fill="var\(--accent\)" fill-opacity="0\.07"/)
  assert.match(chart, /fill="var\(--danger\)" fill-opacity="0\.06"/)
  assert.equal((chart.match(/stroke="var\(--separator\)"/g) ?? []).length, 2)
  assert.equal(overviewTrafficState([{ index: 2, down: 20, up: 5 }]), 'active')
  assert.equal(overviewTrafficRangeSeconds([]), undefined)
  assert.equal(overviewTrafficRangeSeconds([{ index: 1000, down: 20, up: 5 }]), undefined)
  assert.equal(
    overviewTrafficRangeSeconds([
      { index: 1000, down: 20, up: 5 },
      { index: 31_000, down: 5, up: 10 }
    ]),
    30
  )
  assert.equal(
    overviewTrafficRangeSeconds([
      { index: 1000, down: 20, up: 5 },
      { index: 64_000, down: 5, up: 10 }
    ]),
    63
  )
})

test('traffic history survives remounts for five minutes and expires by timestamp', () => {
  const now = 500_000
  const samples = [
    { index: now - overviewTrafficRetentionMs - 1, down: 10, up: 0 },
    { index: now - 60_000, down: 20, up: 5 },
    { index: now - 1_000, down: 0, up: 0 }
  ]
  assert.deepEqual(pruneOverviewTrafficHistory(samples, now), samples.slice(1))
  assert.deepEqual(parseOverviewTrafficHistory(JSON.stringify(samples), now), samples.slice(1))
  assert.deepEqual(parseOverviewTrafficHistory('{invalid', now), [])
  assert.deepEqual(
    parseOverviewTrafficHistory(JSON.stringify([{ index: now, down: -1, up: 0 }]), now),
    []
  )
  assert.deepEqual(pruneOverviewTrafficHistory(samples, now + overviewTrafficRetentionMs), [])
  assert.equal(
    pruneOverviewTrafficHistory(
      Array.from({ length: 400 }, (_, index) => ({
        index: now - 199_500 + index * 500,
        down: 1,
        up: 0
      })),
      now
    ).length,
    overviewTrafficMaximumSamples
  )

  const paths = overviewTrafficPaths(samples.slice(1), now)
  assert.equal((paths.down.match(/M/g) ?? []).length, 2)
  assert.equal((paths.up.match(/M/g) ?? []).length, 2)
  assert.equal(overviewTrafficRangeSeconds(samples.slice(1), now), 60)
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
  assert.doesNotMatch(html, /0\.5 s sample/)
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

  const retained = renderToStaticMarkup(
    <TopActiveAppContent
      application={application}
      metadata={{ name: 'Discord' }}
      explanation="Last observed application; no current rate."
    />
  )
  assert.match(retained, /Recently observed app/)
  assert.doesNotMatch(retained, /Top active app/)
  assert.match(retained, /Discord/)
  assert.doesNotMatch(retained, /KB\/s|B\/s/)
})
