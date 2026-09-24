import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  countryFlagAssetKey,
  displayServiceVersion,
  homeBackgroundChoice,
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

test('Home background starts at none and keeps explicit built-in and custom choices distinct', () => {
  assert.equal(homeBackgroundChoice(undefined), 'none')
  assert.equal(homeBackgroundChoice({}), 'none')
  assert.equal(homeBackgroundChoice({ homeBackgroundDisabled: true }), 'none')
  assert.equal(homeBackgroundChoice({ homeBackgroundDisabled: false }), 'default')
  const custom = {
    file: 'home-background-0123456789abcdef0123456789abcdef.png',
    fit: 'cover',
    position: 'center',
    opacity: 70,
    blur: 0,
    overlay: 35
  } as const
  assert.equal(homeBackgroundChoice({ homeBackground: custom }), 'custom')
  assert.equal(
    homeBackgroundChoice({ homeBackground: custom, homeBackgroundDisabled: true }),
    'none'
  )
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
import {
  createConnectionCounterResetState,
  nextConnectionCounterBaseline,
  withConnectionSpeeds
} from '../src/renderer/src/components/connections/connection-speeds.ts'
import {
  activeRouteCount,
  connectionActivityFreshnessMs,
  connectionApplicationIdentity,
  displayedTopApplication,
  hasFreshConnectionActivity,
  macosHostApplicationPath,
  parseRememberedTopApplication,
  rememberTopApplication,
  topActiveApplication
} from '../src/renderer/src/utils/home-connections.ts'

function homeConnection(
  id: string,
  process: string,
  download: number,
  upload: number,
  route = 'DIRECT',
  processPath = `/apps/${process}`
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
  assert.deepEqual(topActiveApplication(sampled, 'linux'), {
    key: 'process:/apps/chrome',
    name: 'Chrome',
    lookupPath: '/apps/chrome',
    kind: 'process',
    downloadSpeed: 1500,
    uploadSpeed: 0
  })
  assert.equal(activeRouteCount(sampled), 2)
  assert.equal(topActiveApplication(current, 'linux'), undefined)
  assert.equal(
    topActiveApplication([homeConnection('missing', '', 0, 0, 'DIRECT', '')], 'linux'),
    undefined
  )
})

test('nested macOS Helpers aggregate under their owning application before ranking', () => {
  const discord = '/Applications/Discord.app'
  const helper = `${discord}/Contents/Frameworks/Discord Helper.app/Contents/MacOS/Discord Helper`
  const renderer = `${discord}/Contents/Frameworks/Discord Helper (Renderer).app/Contents/MacOS/Discord Helper (Renderer)`
  const canary = '/Applications/Discord Canary.app/Contents/MacOS/Discord Canary'
  assert.equal(macosHostApplicationPath(helper), discord)
  assert.equal(
    macosHostApplicationPath('/Applications/Discord.app/../Other.app/Contents/MacOS/x'),
    undefined
  )
  assert.equal(macosHostApplicationPath('Discord Helper'), undefined)

  const connections = [
    {
      ...homeConnection('h1', 'Discord Helper', 0, 0, 'JP', helper),
      downloadSpeed: 300,
      uploadSpeed: 50
    },
    {
      ...homeConnection('h2', 'Discord Helper (Renderer)', 0, 0, 'JP', renderer),
      downloadSpeed: 250,
      uploadSpeed: 100
    },
    {
      ...homeConnection('canary', 'Discord Canary', 0, 0, 'JP', canary),
      downloadSpeed: 500,
      uploadSpeed: 0
    },
    {
      ...homeConnection(
        'other',
        'Chrome',
        0,
        0,
        'JP',
        '/Applications/Chrome.app/Contents/MacOS/Chrome'
      ),
      downloadSpeed: 600,
      uploadSpeed: 0
    }
  ]
  const originalPath = connections[0].metadata.processPath
  assert.deepEqual(topActiveApplication(connections, 'darwin'), {
    key: `application:${discord}`,
    name: 'Discord',
    lookupPath: discord,
    kind: 'application',
    downloadSpeed: 550,
    uploadSpeed: 150
  })
  assert.equal(connections[0].metadata.processPath, originalPath)
  assert.notEqual(
    connectionApplicationIdentity(connections[2], 'darwin')?.key,
    connectionApplicationIdentity(connections[0], 'darwin')?.key
  )
})

test('Top activity keeps distinct executable paths and omits ambiguous identities', () => {
  const first = {
    ...homeConnection('first', 'Browser', 0, 0, 'DIRECT', '/opt/stable/browser'),
    downloadSpeed: 0.2,
    uploadSpeed: 0
  }
  const second = {
    ...homeConnection('second', 'Browser', 0, 0, 'DIRECT', '/opt/beta/browser'),
    downloadSpeed: 0.1,
    uploadSpeed: 0
  }
  assert.equal(topActiveApplication([first, second], 'linux')?.downloadSpeed, 0.2)
  assert.notEqual(
    connectionApplicationIdentity(first, 'linux')?.key,
    connectionApplicationIdentity(second, 'linux')?.key
  )
  assert.equal(topActiveApplication([first, first], 'linux')?.downloadSpeed, 0.2)
  assert.equal(
    connectionApplicationIdentity(
      homeConnection('x', 'Helper', 0, 0, 'JP', '/usr/bin/Helper'),
      'darwin'
    ),
    undefined
  )
  assert.equal(
    connectionApplicationIdentity(
      homeConnection('x', 'Discord Helper', 0, 0, 'JP', '/usr/bin/Discord Helper'),
      'darwin'
    )?.name,
    'Discord Helper'
  )
  assert.equal(
    connectionApplicationIdentity(homeConnection('x', 'Unknown', 0, 0, 'JP', ''), 'linux'),
    undefined
  )
  assert.equal(
    connectionApplicationIdentity(
      { ...first, metadata: { ...first.metadata, type: 'Inner' } },
      'linux'
    ),
    undefined
  )
})

test('connection speed sampling uses elapsed time and rejects resets, gaps and invalid counters', () => {
  const before = homeConnection('id', 'Browser', 100, 50)
  const after = homeConnection('id', 'Browser', 200, 75)
  assert.deepEqual(
    [
      withConnectionSpeeds([after], [before], 500)[0].downloadSpeed,
      withConnectionSpeeds([after], [before], 500)[0].uploadSpeed
    ],
    [200, 50]
  )
  assert.equal(withConnectionSpeeds([after], undefined, 500)[0].downloadSpeed, 0)
  assert.equal(withConnectionSpeeds([after], [before], 0)[0].downloadSpeed, 0)
  assert.equal(withConnectionSpeeds([after], [before], 31_000)[0].downloadSpeed, 0)
  assert.equal(withConnectionSpeeds([after, after], [before], 500).length, 1)
  const reset = { ...after, download: 10, upload: Number.NaN }
  const sampled = withConnectionSpeeds([reset], [before], 500)[0]
  assert.equal(sampled.downloadSpeed, 0)
  assert.equal(sampled.uploadSpeed, 0)
  assert.equal(
    withConnectionSpeeds([{ ...after, download: Number.POSITIVE_INFINITY }], [before], 500)[0]
      .downloadSpeed,
    0
  )
  assert.equal(withConnectionSpeeds([{ ...after, upload: -1 }], [before], 500)[0].uploadSpeed, 0)
  const resets = createConnectionCounterResetState()
  const baseline = nextConnectionCounterBaseline([reset], [before], resets)[0]
  assert.equal(baseline.download, 100)
  assert.equal(
    withConnectionSpeeds([{ ...after, download: 110 }], [baseline], 500)[0].downloadSpeed,
    20
  )
  const recovered = nextConnectionCounterBaseline([reset], [baseline], resets)[0]
  assert.equal(recovered.download, 10)
  assert.equal(
    withConnectionSpeeds([{ ...after, download: 15 }], [recovered], 500)[0].downloadSpeed,
    10
  )
  const slow = withConnectionSpeeds([{ ...after, download: 101 }], [before], 5000)[0]
  assert.equal(slow.downloadSpeed, 0.2)
  assert.equal(
    withConnectionSpeeds([{ ...after, start: 'new lifetime' }], [before], 500)[0].downloadSpeed,
    0
  )
})

test('Top activity requires a measured sample and expires without another connection event', () => {
  assert.equal(connectionActivityFreshnessMs(500), 5000)
  assert.equal(hasFreshConnectionActivity(undefined, 500, 1000, 500), false)
  assert.equal(hasFreshConnectionActivity(1000, 0, 1000, 500), false)
  assert.equal(hasFreshConnectionActivity(1000, 500, 5999, 500), true)
  assert.equal(hasFreshConnectionActivity(1000, 500, 6000, 500), false)
  assert.equal(hasFreshConnectionActivity(1000, 500, 999, 500), false)
  assert.equal(topActiveApplication(undefined, 'darwin'), undefined)
})

test('Top activity remembers only application identity, never an old positive rate', () => {
  const active = {
    key: 'application:/Applications/Discord.app',
    name: 'Discord',
    lookupPath: '/Applications/Discord.app',
    kind: 'application' as const,
    downloadSpeed: 2048,
    uploadSpeed: 256
  }
  const remembered = rememberTopApplication(active)
  assert.deepEqual(remembered, {
    key: active.key,
    name: active.name,
    lookupPath: active.lookupPath,
    kind: active.kind
  })
  assert.deepEqual(parseRememberedTopApplication(JSON.stringify(remembered)), remembered)
  assert.equal(displayedTopApplication(active, remembered), active)
  assert.deepEqual(displayedTopApplication(undefined, remembered), {
    ...remembered,
    downloadSpeed: 0,
    uploadSpeed: 0
  })
  assert.equal(displayedTopApplication(undefined, undefined), undefined)
  assert.equal(parseRememberedTopApplication('invalid JSON'), undefined)
  assert.equal(
    parseRememberedTopApplication(JSON.stringify({ ...remembered, lookupPath: '../Discord.app' })),
    undefined
  )
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
  const networkCardManaged = path.join(root, 'network-card-managed')
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
    const networkCard = await importManagedHomeBackground(original, networkCardManaged)
    assert.notEqual(second, first)
    assert.equal(await readManagedHomeBackground(managed, networkCard), undefined)
    await removeManagedHomeBackground(managed, first)
    assert.equal(await readManagedHomeBackground(managed, first), undefined)
    assert.equal(
      (await readManagedHomeBackground(networkCardManaged, networkCard))?.startsWith(
        'data:image/png;base64,'
      ),
      true
    )
    assert.deepEqual(await readFile(original), png)
    await removeManagedHomeBackground(managed, '../original.png')
    assert.deepEqual(await readFile(original), png)
    await removeManagedHomeBackground(managed, second)
    assert.equal(await readManagedHomeBackground(managed, second), undefined)
    await removeManagedHomeBackground(networkCardManaged, networkCard)
    assert.equal(await readManagedHomeBackground(networkCardManaged, networkCard), undefined)
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
