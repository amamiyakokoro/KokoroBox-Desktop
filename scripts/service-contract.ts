import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  dnsLeasePayload,
  serviceContract,
  validateCoreDesiredStatus,
  validateServiceMeta
} from '../src/main/service/contract'
import { KOKOROBOX_SERVICE_STABLE_TAG } from './kokorobox-service'
import { validateServiceProcessRouterStatus } from '../src/main/app-routing/service-protocol'

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
        dnsRelease: serviceContract.dnsRelease,
        sysproxyStatus: serviceContract.sysproxyStatus,
        sysproxyEvents: serviceContract.sysproxyEvents,
        sysproxyPac: {
          ...serviceContract.sysproxyPac,
          body: {
            url: 'http://127.0.0.1:7890/pac',
            device: 'Wi-Fi',
            only_active_device: true,
            use_registry: false,
            guard: true
          }
        },
        sysproxyProxy: {
          ...serviceContract.sysproxyProxy,
          body: {
            server: '127.0.0.1:7890',
            bypass: 'localhost,127.0.0.1',
            device: 'Wi-Fi',
            only_active_device: true,
            use_registry: false,
            guard: true
          }
        },
        sysproxyDisable: {
          ...serviceContract.sysproxyDisable,
          body: { device: 'Wi-Fi', only_active_device: true, use_registry: false }
        },
        sysproxyRenew: serviceContract.sysproxyRenew,
        processRouterStart: serviceContract.processRouterStart,
        processRouterStop: serviceContract.processRouterStop,
        processRouterRules: {
          ...serviceContract.processRouterRules,
          body: {
            version: 1,
            platform: 'linux',
            proxy_port: 7894,
            fail_closed: true,
            proxy_udp_dns: true,
            diagnostic_logging: false,
            rules: [
              {
                id: 'desktop-contract',
                executable_path: '/usr/bin/example',
                executable_name: 'example',
                protocol: 'both',
                action: 'proxy',
                enabled: true,
                priority: 1
              }
            ]
          }
        },
        processRouterStatus: serviceContract.processRouterStatus,
        processRouterFirewallRepair: serviceContract.processRouterFirewallRepair,
        processRouterCleanup: serviceContract.processRouterCleanup
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
  validateServiceProcessRouterStatus(
    JSON.parse(readFileSync(`${location}/process-router-status.json`, 'utf8')),
    'linux'
  )
}
