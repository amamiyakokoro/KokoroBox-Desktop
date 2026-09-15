import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

function source(path: string): string {
  return readFileSync(resolve(path), 'utf8')
}

test('network and SSID policies share the native context watcher', () => {
  const watcher = source('src/main/sys/network-context.ts')
  const network = source('src/main/core/network.ts')
  const ssid = source('src/main/sys/ssid.ts')

  assert.match(watcher, /waitForNetworkContextChange/)
  assert.match(network, /observeNetworkContext/)
  assert.match(ssid, /observeNetworkContext/)
  assert.doesNotMatch(network, /networkInterfaces|net\.isOnline|setInterval/)
  assert.doesNotMatch(ssid, /setInterval/)
})

test('service request signing does not expose or persist new private keys in JavaScript', () => {
  const key = source('src/main/service/key.ts')
  const manager = source('src/main/service/manager.ts')
  const store = source('src/main/service/auth-store.ts')

  assert.match(key, /openServiceIdentity/)
  assert.match(key, /identity\.sign\(data\)/)
  assert.doesNotMatch(key, /getPrivateKey\(/)
  assert.match(manager, /await deleteServiceAuthSecret\(\)/)
  assert.doesNotMatch(store, /writeFile|rename|storage: 'plain',[\s\S]*save/)
})
