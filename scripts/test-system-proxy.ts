import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PacHttpServer, localPacUrl } from '../src/main/resolve/pac-http-server'
import { defaultSystemProxyBypass, normalizeProxyHost } from '../src/shared/system-proxy'

test('PAC listener is loopback-only, reuses an unchanged script, and closes before returning', async (t) => {
  const server = new PacHttpServer()
  t.after(() => server.stop())

  const port = await server.start('function FindProxyForURL() { return "DIRECT"; }')
  const url = localPacUrl(port)
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/pac$/)
  assert.match(await (await fetch(url)).text(), /DIRECT/)
  assert.equal(await server.start('function FindProxyForURL() { return "DIRECT"; }'), port)
  assert.equal((await fetch(`http://127.0.0.1:${port}/other`)).status, 404)

  await server.stop()
  await assert.rejects(fetch(url))

  const nextPort = await server.start(
    'function FindProxyForURL() { return "PROXY 127.0.0.1:7890"; }'
  )
  assert.match(await (await fetch(localPacUrl(nextPort))).text(), /PROXY 127\.0\.0\.1:7890/)
})

test('PAC start and stop requests serialize without leaving a listener', async () => {
  const server = new PacHttpServer()
  const start = server.start('DIRECT')
  const stop = server.stop()
  const port = await start
  await stop
  await assert.rejects(fetch(localPacUrl(port)))
})

test('proxy host validation accepts hosts and rejects URLs, ports, and control characters', () => {
  assert.equal(normalizeProxyHost(''), '127.0.0.1')
  assert.equal(normalizeProxyHost(' EXAMPLE.com '), 'example.com')
  assert.equal(normalizeProxyHost('::1'), '[::1]')
  for (const invalid of [
    'https://example.com',
    'example.com:8080',
    'example.com/path',
    'bad\nhost'
  ]) {
    assert.throws(() => normalizeProxyHost(invalid), /Invalid proxy host/)
  }
})

test('all platforms receive independent copies of the same default bypass values', () => {
  assert.deepEqual(defaultSystemProxyBypass('linux').slice(0, 2), ['localhost', '.local'])
  assert.ok(defaultSystemProxyBypass('darwin').includes('*.local'))
  assert.ok(defaultSystemProxyBypass('win32').includes('172.31.*'))
  const first = defaultSystemProxyBypass('win32')
  first.push('modified')
  assert.equal(defaultSystemProxyBypass('win32').includes('modified'), false)
})
