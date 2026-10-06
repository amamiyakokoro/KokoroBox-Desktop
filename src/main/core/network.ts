import { getAppConfig, patchAppConfig } from '../config'
import {
  releaseDnsLease,
  renewDnsLease,
  ServiceAPIError,
  setDnsLease,
  setSysDns
} from '../service/api'
import { createDnsLeaseController } from './dns-lease-controller'
import { triggerSysProxy } from '../sys/sysproxy'
import { appendAppLog } from '../utils/log'
import { observeNetworkContext, readNetworkContext } from '../sys/network-context'

export interface NetworkCoreController {
  shouldStartCore: (networkDownHandled: boolean) => boolean
  startCore: () => Promise<void>
  stopCore: () => Promise<void>
}

let setPublicDNSTimer: NodeJS.Timeout | null = null
let dnsSetupGeneration = 0
const dnsLeaseController = createDnsLeaseController({
  acquire: () => setDnsLease(['223.5.5.5']),
  renew: renewDnsLease,
  release: releaseDnsLease,
  isMissingLease: (error) => error instanceof ServiceAPIError && error.status === 409,
  onError: (error) => {
    void appendAppLog(`[Network]: DNS lease renewal failed, ${error}\n`).catch(() => {})
  }
})
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

export async function setPublicDNS(): Promise<void> {
  if (process.platform !== 'darwin') return
  const generation = ++dnsSetupGeneration
  if (setPublicDNSTimer) clearTimeout(setPublicDNSTimer)
  setPublicDNSTimer = null
  if ((await readNetworkContext()).online) {
    const { originDNS, autoSetDNSMode = 'none' } = await getAppConfig()
    if (generation !== dnsSetupGeneration) return
    if (originDNS) await restoreLegacyDNS(originDNS)
    if (generation !== dnsSetupGeneration) return
    if (autoSetDNSMode === 'none') return
    await dnsLeaseController.start()
  } else {
    if (generation !== dnsSetupGeneration) return
    setPublicDNSTimer = setTimeout(() => {
      void setPublicDNS().catch((error) => {
        void appendAppLog(`[Network]: DNS lease setup failed, ${error}\n`).catch(() => {})
      })
    }, 5000)
  }
}

export async function recoverDNS(): Promise<void> {
  if (process.platform !== 'darwin') return
  ++dnsSetupGeneration
  if (setPublicDNSTimer) clearTimeout(setPublicDNSTimer)
  setPublicDNSTimer = null
  await dnsLeaseController.stop()
  const { originDNS } = await getAppConfig()
  if (originDNS) await restoreLegacyDNS(originDNS)
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
