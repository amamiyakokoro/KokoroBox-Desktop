import axios from 'axios'
import { app } from 'electron'
import { getControledMihomoConfig } from '../config'
import { getAxios } from '../core/mihomoApi'
import {
  publicIpRequestOptions,
  createPublicIpCache,
  tryPublicIpEndpoints
} from './public-ip-lookup'

const publicIpCache = createPublicIpCache(async () => {
  const { 'mixed-port': mixedPort = 7890 } = await getControledMihomoConfig()
  if (!Number.isInteger(mixedPort) || mixedPort < 1 || mixedPort > 65535) return undefined

  // A configured port is not proof that Mihomo is running. Never fall back to a
  // direct request, since that could show a different exit from the app's proxy.
  const controller = await getAxios()
  await controller.get('/version', { timeout: 2000 })
  return tryPublicIpEndpoints(async (endpoint) => {
    const response = await axios.get<string>(
      endpoint,
      publicIpRequestOptions(mixedPort, app.getVersion())
    )
    return { status: response.status, body: response.data }
  })
})

export function getHomePublicIp(forceRefresh = false) {
  return publicIpCache.get(forceRefresh)
}
