import axios from 'axios'
import { app } from 'electron'
import type { PublicIpSnapshot } from '../../shared/home'
import { getControledMihomoConfig } from '../config'
import { getAxios } from '../core/mihomoApi'
import {
  publicIpRequestOptions,
  nextPublicIpSnapshot,
  tryPublicIpEndpoints
} from './public-ip-lookup'
let snapshot: PublicIpSnapshot = { stale: true }
let lookupGeneration = 0

export async function getHomePublicIp(): Promise<PublicIpSnapshot> {
  const generation = ++lookupGeneration
  try {
    const { 'mixed-port': mixedPort = 7890 } = await getControledMihomoConfig()
    if (!Number.isInteger(mixedPort) || mixedPort < 1 || mixedPort > 65535) {
      if (generation === lookupGeneration) snapshot = nextPublicIpSnapshot(snapshot, undefined)
      return snapshot
    }
    // A configured port is not proof that Mihomo is running. Never fall back to a
    // direct request, since that could show a different exit from the app's proxy.
    const controller = await getAxios()
    await controller.get('/version', { timeout: 2000 })
    const found = await tryPublicIpEndpoints(async (endpoint) => {
      const response = await axios.get<string>(
        endpoint,
        publicIpRequestOptions(mixedPort, app.getVersion())
      )
      return { status: response.status, body: response.data }
    })
    if (generation === lookupGeneration) snapshot = nextPublicIpSnapshot(snapshot, found)
  } catch {
    if (generation === lookupGeneration) snapshot = nextPublicIpSnapshot(snapshot, undefined)
  }
  return snapshot
}
