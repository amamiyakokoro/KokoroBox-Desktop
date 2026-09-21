import { getAppConfig, patchAppConfig } from '../config'
import {
  releaseDnsLease,
  renewDnsLease,
  ServiceAPIError,
  setDnsLease,
  setSysDns
} from '../service/api'
import { triggerSysProxy } from '../sys/sysproxy'
import { appendAppLog } from '../utils/log'
import { observeNetworkContext, readNetworkContext } from '../sys/network-context'

export interface NetworkCoreController {
  shouldStartCore: (networkDownHandled: boolean) => boolean
  startCore: () => Promise<void>
  stopCore: () => Promise<void>
}

let setPublicDNSTimer: NodeJS.Timeout | null = null
let dnsLeaseRenewTimer: NodeJS.Timeout | null = null
let dnsLeaseGeneration = 0
let stopNetworkContextObserver: (() => void) | null = null
let networkDetectionGeneration = 0
let networkDownHandled = false

async function getDefaultService(): Promise<string> {
  const { defaultService } = await readNetworkContext()
  if (!defaultService) throw new Error('Get network service failed')
  return defaultService
}

async function restoreLegacyDNS(originDNS: string): Promise<void> {
  const context = await readNetworkContext()
  // Older Desktop builds stored the original DNS locally. Restore it only when
  // the service still has the DNS value that those builds installed.
  if (context.dnsServers.length === 1 && context.dnsServers[0] === '223.5.5.5') {
    const service = await getDefaultService()
    await setSysDns(service, originDNS === 'Empty' ? [] : originDNS.split(' ').filter(Boolean))
  }
  await patchAppConfig({ originDNS: undefined })
}

function stopDnsLeaseRenewal(): void {
  dnsLeaseGeneration++
  if (dnsLeaseRenewTimer) clearTimeout(dnsLeaseRenewTimer)
  dnsLeaseRenewTimer = null
}

function startDnsLeaseRenewal(): void {
  stopDnsLeaseRenewal()
  const generation = dnsLeaseGeneration
  const renew = async (): Promise<void> => {
    if (generation !== dnsLeaseGeneration) return
    try {
      await renewDnsLease()
    } catch (error) {
      if (error instanceof ServiceAPIError && error.status === 409) {
        try {
          await setDnsLease(['223.5.5.5'])
        } catch (recoveryError) {
          await appendAppLog(`[Network]: DNS lease recovery failed, ${recoveryError}\n`).catch(
            () => {}
          )
        }
      } else {
        await appendAppLog(`[Network]: DNS lease renewal failed, ${error}\n`).catch(() => {})
      }
    }
    if (generation === dnsLeaseGeneration) {
      dnsLeaseRenewTimer = setTimeout(() => void renew(), 20_000)
    }
  }
  dnsLeaseRenewTimer = setTimeout(() => void renew(), 20_000)
}

export async function setPublicDNS(): Promise<void> {
  if (process.platform !== 'darwin') return
  if (setPublicDNSTimer) clearTimeout(setPublicDNSTimer)
  setPublicDNSTimer = null
  if ((await readNetworkContext()).online) {
    const { originDNS, autoSetDNSMode = 'none' } = await getAppConfig()
    if (originDNS) await restoreLegacyDNS(originDNS)
    if (autoSetDNSMode === 'none') return
    if (autoSetDNSMode === 'exec') await patchAppConfig({ autoSetDNSMode: 'service' })
    await setDnsLease(['223.5.5.5'])
    startDnsLeaseRenewal()
  } else {
    setPublicDNSTimer = setTimeout(() => {
      void setPublicDNS().catch((error) => {
        void appendAppLog(`[Network]: DNS lease setup failed, ${error}\n`).catch(() => {})
      })
    }, 5000)
  }
}

export async function recoverDNS(): Promise<void> {
  if (process.platform !== 'darwin') return
  if (setPublicDNSTimer) clearTimeout(setPublicDNSTimer)
  setPublicDNSTimer = null
  stopDnsLeaseRenewal()
  const { originDNS } = await getAppConfig()
  if (originDNS) await restoreLegacyDNS(originDNS)
  await releaseDnsLease()
}

export async function startNetworkDetectionController(
  controller: NetworkCoreController
): Promise<void> {
  const generation = ++networkDetectionGeneration
  let detecting = false
  if (generation !== networkDetectionGeneration) return
  stopNetworkContextObserver?.()

  const handleNetworkContext = async (context: { online: boolean }): Promise<void> => {
    if (detecting || generation !== networkDetectionGeneration) return
    detecting = true
    try {
      const { onlyActiveDevice = false, sysProxy = { enable: false } } = await getAppConfig()
      if (generation !== networkDetectionGeneration) return
      if (context.online) {
        if (controller.shouldStartCore(networkDownHandled)) {
          await controller.startCore()
          if (generation !== networkDetectionGeneration) return
          if (sysProxy.enable) await triggerSysProxy(true, onlyActiveDevice)
          networkDownHandled = false
        }
      } else if (!networkDownHandled) {
        if (sysProxy.enable) await triggerSysProxy(false, onlyActiveDevice, true)
        if (generation !== networkDetectionGeneration) return
        await controller.stopCore()
        if (generation === networkDetectionGeneration) {
          networkDownHandled = true
        }
      }
    } catch (error) {
      appendAppLog(`[Network]: network detection failed, ${error}\n`).catch(() => {})
    } finally {
      detecting = false
    }
  }

  stopNetworkContextObserver = observeNetworkContext(handleNetworkContext)
}

export function stopNetworkDetection(): void {
  networkDetectionGeneration++
  stopNetworkContextObserver?.()
  stopNetworkContextObserver = null
}
