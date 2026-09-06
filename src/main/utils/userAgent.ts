import { getAppConfig } from '../config/app'
import { mihomoVersion } from '../core/mihomoApi'

const TIMEOUT_MS = 300
const DEFAULT_USER_AGENT = 'clash.meta/alpha-e89af72'

export async function getUserAgent(): Promise<string> {
  const { userAgent } = await getAppConfig()
  if (userAgent) {
    return userAgent
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const result = await mihomoVersion()
    clearTimeout(timeoutId)

    if (result?.version) {
      return `clash.meta/${result.version}`
    }

    return DEFAULT_USER_AGENT
  } catch (error) {
    return DEFAULT_USER_AGENT
  }
}
