import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  dnsLeasePayload,
  serviceContract,
  validateCoreDesiredStatus,
  validateServiceMeta
} from '../src/main/service/contract'
import { KOKOROBOX_SERVICE_STABLE_TAG } from './kokorobox-service'

const [command, location] = process.argv.slice(2)
if (command === 'github-output') {
  process.stdout.write(`tag=${KOKOROBOX_SERVICE_STABLE_TAG}\n`)
  process.exit(0)
}
if (!location || (command !== 'write' && command !== 'verify')) {
  throw new Error('Usage: tsx scripts/service-contract.ts github-output|write|verify <path>')
}

if (command === 'write') {
  writeFileSync(
    location,
    JSON.stringify(
      {
        serviceTag: KOKOROBOX_SERVICE_STABLE_TAG,
        meta: serviceContract.meta,
        coreDesired: serviceContract.coreDesired,
        dnsLease: {
          ...serviceContract.dnsLease,
          body: dnsLeasePayload(['203.0.113.53'])
        },
        dnsRenew: serviceContract.dnsRenew,
        dnsRelease: serviceContract.dnsRelease
      },
      null,
      2
    ) + '\n'
  )
} else {
  const meta = validateServiceMeta(JSON.parse(readFileSync(`${location}/meta.json`, 'utf8')))
  const desired = validateCoreDesiredStatus(
    JSON.parse(readFileSync(`${location}/core-desired.json`, 'utf8'))
  )
  assert.equal(meta.apiVersion, 1)
  assert.equal(meta.capabilities.coreDesiredState, true)
  assert.equal(desired.desired_state, 'stopped')
}
