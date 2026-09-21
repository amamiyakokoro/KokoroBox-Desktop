import * as native from 'kokorobox-native'
import { getAppConfig, patchAppConfig } from '../config'
import { setSysDns } from '../service/api'
import { triggerSysProxy } from '../sys/sysproxy'
import { appendAppLog } from '../utils/log'
import { observeNetworkContext, readNetworkContext } from '../sys/network-context'

export interface NetworkCoreController {
  shouldStartCore: (networkDownHandled: boolean) => boolean
  startCore: () => Promise<void>
  stopCore: () => Promise<void>
}

let setPublicDNSTimer: NodeJS.Timeout | null = null
let recoverDNSTimer: NodeJS.Timeout | null = null
let stopNetworkContextObserver: (() => void) | null = null
let networkDetectionGeneration = 0
let networkDownHandled = false

async function getDefaultService(): Promise<string> {
  const { defaultService } = await readNetworkContext()
  if (!defaultService) throw new Error('Get network service failed')
  return defaultService
}

async function getOriginDNS(): Promise<void> {
  const { dnsServers } = await readNetworkContext()
  await patchAppConfig({ originDNS: dnsServers.length > 0 ? dnsServers.join(' ') : 'Empty' })
}

async function setDNS(dns: string, mode: 'none' | 'exec' | 'service'): Promise<void> {
  const dnsServers = dns === 'Empty' ? [] : dns.split(' ')
  if (mode === 'exec') {
    const setActiveNetworkDns = (
      native as typeof native & {
        setActiveNetworkDns?: (servers: string[]) => Promise<void>
      }
    ).setActiveNetworkDns
    if (!setActiveNetworkDns) {
      throw new Error('Installed kokorobox-native does not include DNS mutation')
    }
    await setActiveNetworkDns(dnsServers)
    return
  }
  if (mode === 'service') {
    const service = await getDefaultService()
    await setSysDns(service, dnsServers)
    return
  }
}

export async function setPublicDNS(): Promise<void> {
  if (process.platform !== 'darwin') return
  if ((await readNetworkContext()).online) {
    const { originDNS, autoSetDNSMode = 'none' } = await getAppConfig()
    if (!originDNS) {
      await getOriginDNS()
      await setDNS('223.5.5.5', autoSetDNSMode)
    }
  } else {
    if (setPublicDNSTimer) clearTimeout(setPublicDNSTimer)
    setPublicDNSTimer = setTimeout(() => setPublicDNS(), 5000)
  }
}

export async function recoverDNS(): Promise<void> {
  if (process.platform !== 'darwin') return
  if ((await readNetworkContext()).online) {
    const { originDNS, autoSetDNSMode = 'none' } = await getAppConfig()
    if (originDNS) {
      await setDNS(originDNS, autoSetDNSMode)
      await patchAppConfig({ originDNS: undefined })
    }
  } else {
    if (recoverDNSTimer) clearTimeout(recoverDNSTimer)
    recoverDNSTimer = setTimeout(() => recoverDNS(), 5000)
  }
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
