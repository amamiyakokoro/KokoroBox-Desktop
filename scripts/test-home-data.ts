import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  countryFlagAssetKey,
  homeRuntimeState,
  isManagedHomeBackgroundFile,
  maskPublicIp
} from '../src/shared/home.ts'
import {
  parsePublicIpResponse,
  nextPublicIpSnapshot,
  publicIpEndpoints,
  publicIpRequestOptions,
  retainPublicIpResult,
  tryPublicIpEndpoints
} from '../src/main/resolve/public-ip-lookup.ts'
import {
  importManagedHomeBackground,
  readManagedHomeBackground,
  removeManagedHomeBackground
} from '../src/main/resolve/home-background-storage.ts'

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
