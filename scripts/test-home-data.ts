import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  countryFlagAssetKey,
  displayServiceVersion,
  homeRuntimeState,
  isManagedHomeBackgroundFile,
  maskPublicIp
} from '../src/shared/home.ts'

test('Home only presents release-style Service versions', () => {
  assert.equal(displayServiceVersion('0.6.0'), 'v0.6.0')
  assert.equal(displayServiceVersion('v0.6.0-rc.1'), 'v0.6.0-rc.1')
  assert.equal(displayServiceVersion('dev+801cb18'), undefined)
  assert.equal(displayServiceVersion('legacy'), undefined)
})
import {
  createPublicIpCache,
  parsePublicIpResponse,
  nextPublicIpSnapshot,
  publicIpCacheLifetimeMs,
  publicIpEndpoints,
  publicIpFailureRetryMs,
  publicIpRequestOptions,
  retainPublicIpResult,
  tryPublicIpEndpoints
} from '../src/main/resolve/public-ip-lookup.ts'
import {
  importManagedHomeBackground,
  readManagedHomeBackground,
  removeManagedHomeBackground
} from '../src/main/resolve/home-background-storage.ts'
import { profileUpdateDelay, nextProfileUpdateAt } from '../src/shared/profile-update.ts'
import { withConnectionSpeeds } from '../src/renderer/src/components/connections/connection-speeds.ts'
import {
  activeRouteCount,
  topActiveApplication
} from '../src/renderer/src/utils/home-connections.ts'

function homeConnection(
  id: string,
  process: string,
  download: number,
  upload: number,
  route = 'DIRECT',
  processPath = process
): ControllerConnectionDetail {
  return {
    id,
    download,
    upload,
    chains: [route],
    metadata: { process, processPath, type: 'HTTP' }
  } as ControllerConnectionDetail
}

test('Home derives application speed from the existing connection stream', () => {
  const previous = [
    homeConnection('chrome-1', 'Chrome', 100, 0, 'JP', '/apps/chrome'),
    homeConnection('chrome-2', 'Chrome', 0, 0, 'JP', '/apps/chrome'),
    homeConnection('mail', 'Mail', 100, 0, 'DIRECT', '/apps/mail')
  ]
  const current = [
    homeConnection('chrome-1', 'Chrome', 600, 0, 'JP', '/apps/chrome'),
    homeConnection('chrome-2', 'Chrome', 250, 0, 'JP', '/apps/chrome'),
    homeConnection('mail', 'Mail', 200, 0, 'DIRECT', '/apps/mail'),
    homeConnection('unknown', '', 2000, 0, 'DIRECT', '')
  ]
  const sampled = withConnectionSpeeds(current, previous, 500)
  assert.deepEqual(
    sampled.map((connection) => connection.downloadSpeed),
    [1000, 500, 200, 0]
  )
  assert.deepEqual(topActiveApplication(sampled), { name: 'Chrome', speed: 1500 })
  assert.equal(activeRouteCount(sampled), 2)
  assert.equal(topActiveApplication(current), undefined)
  assert.equal(topActiveApplication([homeConnection('missing', '', 0, 0, 'DIRECT', '')]), undefined)
})

test('Home uses the same subscription update clock as the profile updater', () => {
  const now = 10_000_000
  const profile = {
    id: 'remote',
    type: 'remote',
    name: 'Example',
    interval: 60,
    updated: now - 20 * 60_000,
    autoUpdate: true
  } as ProfileItem
  assert.equal(profileUpdateDelay(profile, now), 40 * 60_000)
  assert.equal(nextProfileUpdateAt(profile, now), now + 40 * 60_000)
  assert.equal(profileUpdateDelay({ ...profile, updated: 0 }, now), 0)
  assert.equal(nextProfileUpdateAt({ ...profile, autoUpdate: false }, now), undefined)
  assert.equal(nextProfileUpdateAt({ ...profile, interval: 0 }, now), undefined)
  assert.equal(nextProfileUpdateAt({ ...profile, type: 'local' }, now), undefined)
})

test('normalizes all three public IP provider shapes and validates addresses', () => {
  assert.deepEqual(
    parsePublicIpResponse('{"ip":"103.45.67.18","country_code":"jp","country":"Japan"}'),
    {
      ip: '103.45.67.18',
      countryCode: 'JP',
      country: 'Japan'
    }
  )
  assert.deepEqual(
    parsePublicIpResponse(
      '{"ip":"2001:db8::1","country_code":"us","country_name":"United States"}'
    ),
    {
      ip: '2001:db8::1',
      countryCode: 'US',
      country: 'United States'
    }
  )
  assert.deepEqual(parsePublicIpResponse('{"ip":"8.8.8.8"}'), { ip: '8.8.8.8' })
  assert.deepEqual(
    parsePublicIpResponse(
      '{"ip":"172.225.7.7","isp":"iCloud Private Relay","asn":36183,"unknown":"ignored"}'
    ),
    { ip: '172.225.7.7', isp: 'iCloud Private Relay', asn: 'AS36183' }
  )
  assert.deepEqual(parsePublicIpResponse('{"ip":"8.8.8.8","org":"Google LLC","asn":"AS15169"}'), {
    ip: '8.8.8.8',
    isp: 'Google LLC',
    asn: 'AS15169'
  })
  assert.deepEqual(parsePublicIpResponse('{"ip":"8.8.8.8","isp":"bad\\nname","asn":"AS0"}'), {
    ip: '8.8.8.8'
  })
  assert.deepEqual(parsePublicIpResponse('{"ip":"8.8.4.4","country":"hk"}'), {
    ip: '8.8.4.4',
    countryCode: 'HK'
  })
  for (const ip of ['999.1.1.1', '2001:xyz::1', 'example.com', '127.0.0.1:80']) {
    assert.equal(parsePublicIpResponse(JSON.stringify({ ip })), undefined)
  }
  assert.equal(parsePublicIpResponse('{bad json'), undefined)
  assert.equal(
    parsePublicIpResponse(JSON.stringify({ ip: '8.8.8.8', country_code: '../' }))?.countryCode,
    undefined
  )
  assert.equal(maskPublicIp('103.45.67.18'), '103.45.**.18')
  assert.equal(maskPublicIp('2001:db8:abcd::1'), '2001:db8:…')
})

test('tries providers in order after HTTP, JSON, IP and response size failures', async () => {
  assert.deepEqual(publicIpEndpoints, [
    'https://api.ip.sb/geoip',
    'https://ipapi.co/json/',
    'https://api64.ipify.org?format=json'
  ])
  const calls: string[] = []
  const found = await tryPublicIpEndpoints(async (endpoint) => {
    calls.push(endpoint)
    if (endpoint === publicIpEndpoints[0]) return { status: 503, body: '{}' }
    if (endpoint === publicIpEndpoints[1]) return { status: 200, body: '{invalid' }
    return { status: 200, body: '{"ip":"1.1.1.1"}' }
  })
  assert.deepEqual(found, { ip: '1.1.1.1' })
  assert.deepEqual(calls, [...publicIpEndpoints])

  const invalidThenValid = await tryPublicIpEndpoints(async (endpoint) => ({
    status: 200,
    body: endpoint === publicIpEndpoints[0] ? '{"ip":"not-an-ip"}' : '{"ip":"8.8.8.8"}'
  }))
  assert.equal(invalidThenValid?.ip, '8.8.8.8')
  const oversizedThenValid = await tryPublicIpEndpoints(async (endpoint) => ({
    status: 200,
    body:
      endpoint === publicIpEndpoints[0]
        ? `${' '.repeat(65537)}{"ip":"1.1.1.1"}`
        : '{"ip":"9.9.9.9"}'
  }))
  assert.equal(oversizedThenValid?.ip, '9.9.9.9')
  assert.equal(
    await tryPublicIpEndpoints(async () => {
      throw new Error('offline')
    }),
    undefined
  )
  assert.deepEqual(retainPublicIpResult({ ip: '1.1.1.1' }, undefined), { ip: '1.1.1.1' })
  assert.deepEqual(nextPublicIpSnapshot({ info: { ip: '1.1.1.1' }, stale: false }, undefined), {
    info: { ip: '1.1.1.1' },
    stale: true
  })
})

test('public IP requests are bounded and explicitly use the local Mihomo proxy', () => {
  const options = publicIpRequestOptions(7890, '4.26.9')
  assert.deepEqual(options.proxy, { protocol: 'http', host: '127.0.0.1', port: 7890 })
  assert.equal(options.timeout, 5000)
  assert.equal(options.maxContentLength, 65536)
  assert.equal(options.headers?.Accept, 'application/json')
  assert.match(String(options.headers?.['User-Agent']), /^KokoroBox-Desktop\//)
  assert.throws(() => publicIpRequestOptions(0, '4.26.9'))
})

test('public IP cache reuses a successful lookup until expiry or explicit refresh', async () => {
  let currentTime = 1_000
  let calls = 0
  const cache = createPublicIpCache(
    async () => ({ ip: `1.1.1.${++calls}` }),
    () => currentTime
  )
  assert.equal((await cache.get()).info?.ip, '1.1.1.1')
  assert.equal((await cache.get()).info?.ip, '1.1.1.1')
  currentTime += publicIpCacheLifetimeMs - 1
  assert.equal((await cache.get()).info?.ip, '1.1.1.1')
  assert.equal(calls, 1)
  assert.equal((await cache.get(true)).info?.ip, '1.1.1.2')
  currentTime += publicIpCacheLifetimeMs
  assert.equal((await cache.get()).info?.ip, '1.1.1.3')
})

test('public IP cache keeps the last result and backs off after a failed refresh', async () => {
  let currentTime = 1_000
  let calls = 0
  const cache = createPublicIpCache(
    async () => {
      calls += 1
      return calls === 2 ? undefined : { ip: `1.1.1.${calls}` }
    },
    () => currentTime
  )
  assert.equal((await cache.get()).stale, false)
  assert.deepEqual(await cache.get(true), { info: { ip: '1.1.1.1' }, stale: true })
  assert.equal((await cache.get()).info?.ip, '1.1.1.1')
  assert.equal(calls, 2)
  currentTime += publicIpFailureRetryMs
  assert.deepEqual(await cache.get(), { info: { ip: '1.1.1.3' }, stale: false })
})

test('public IP cache shares pending reads and ignores an overtaken lookup', async () => {
  const resolves: Array<(value: { ip: string }) => void> = []
  const cache = createPublicIpCache(
    () =>
      new Promise<{ ip: string }>((resolve) => {
        resolves.push(resolve)
      }),
    () => 1_000
  )
  const first = cache.get()
  const shared = cache.get()
  assert.equal(shared, first)
  const refreshed = cache.get(true)
  assert.equal(resolves.length, 2)
  resolves[1]({ ip: '2.2.2.2' })
  assert.equal((await refreshed).info?.ip, '2.2.2.2')
  resolves[0]({ ip: '1.1.1.1' })
  assert.equal((await first).info?.ip, '2.2.2.2')
  assert.equal((await cache.get()).info?.ip, '2.2.2.2')
})

test('country flag lookup creates only local, valid asset keys', () => {
  assert.equal(countryFlagAssetKey('JP'), '../../assets/circle-flags/jp.svg')
  assert.equal(countryFlagAssetKey('us'), '../../assets/circle-flags/us.svg')
  for (const input of ['../', 'J/P', 'JPN', '1A', '', null]) {
    assert.equal(countryFlagAssetKey(input), undefined)
  }
  for (const code of ['jp', 'us', 'hk']) {
    assert.equal(
      existsSync(path.join(process.cwd(), 'src/renderer/src/assets/circle-flags', `${code}.svg`)),
      true
    )
  }
  assert.equal(
    existsSync(path.join(process.cwd(), 'src/renderer/src/assets/circle-flags/xx.svg')),
    false
  )
})

test('runtime state keeps Mihomo execution and KokoroBox Service independent', () => {
  assert.deepEqual(homeRuntimeState(true, 'elevated', 'running'), {
    mihomo: 'direct-run',
    service: 'running'
  })
  assert.deepEqual(homeRuntimeState(true, 'service', 'running'), {
    mihomo: 'system-service',
    service: 'running'
  })
  assert.deepEqual(homeRuntimeState(false, 'service', 'running'), {
    mihomo: 'stopped',
    service: 'running'
  })
})

test('background import, replacement and clearing affect only managed files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kokoro-home-background-'))
  const original = path.join(root, 'original.png')
  const managed = path.join(root, 'managed')
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR5sAAAAASUVORK5CYII=',
    'base64'
  )
  try {
    await writeFile(original, png)
    const first = await importManagedHomeBackground(original, managed)
    assert.equal(isManagedHomeBackgroundFile(first), true)
    assert.equal(
      (await readManagedHomeBackground(managed, first))?.startsWith('data:image/png;base64,'),
      true
    )
    const second = await importManagedHomeBackground(original, managed)
    assert.notEqual(second, first)
    await removeManagedHomeBackground(managed, first)
    assert.equal(await readManagedHomeBackground(managed, first), undefined)
    assert.deepEqual(await readFile(original), png)
    await removeManagedHomeBackground(managed, '../original.png')
    assert.deepEqual(await readFile(original), png)
    await removeManagedHomeBackground(managed, second)
    assert.equal(await readManagedHomeBackground(managed, second), undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('background import rejects invalid and oversized files without deleting the original', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kokoro-home-invalid-'))
  const original = path.join(root, 'bad.png')
  try {
    await writeFile(original, 'not an image')
    await assert.rejects(importManagedHomeBackground(original, path.join(root, 'managed')))
    assert.equal(await readFile(original, 'utf8'), 'not an image')
    const file = await import('node:fs/promises').then(({ open }) => open(original, 'w'))
    try {
      await file.truncate(20 * 1024 * 1024 + 1)
    } finally {
      await file.close()
    }
    await assert.rejects(importManagedHomeBackground(original, path.join(root, 'managed')))
    assert.equal((await stat(original)).size, 20 * 1024 * 1024 + 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
