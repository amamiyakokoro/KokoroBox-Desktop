import { controledMihomoConfigPath } from '../utils/dirs'
import { readFile } from 'fs/promises'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { generateProfile } from '../core/factory'
import { getAppConfig } from './app'
import { defaultControledMihomoConfig } from '../utils/template'
import { deepMerge } from '../utils/merge'
import { writePrivateTextFileAtomic } from './atomic-file'

let controledMihomoConfig: Partial<MihomoConfig> // mihomo.yaml
let writePromise: Promise<void> = Promise.resolve()

function cloneDefaultConfig(): Partial<MihomoConfig> {
  return structuredClone(defaultControledMihomoConfig)
}

export async function getControledMihomoConfig(force = false): Promise<Partial<MihomoConfig>> {
  if (force || !controledMihomoConfig) {
    try {
      const data = await readFile(controledMihomoConfigPath(), 'utf-8')
      controledMihomoConfig = parseYaml<Partial<MihomoConfig>>(data) || cloneDefaultConfig()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      controledMihomoConfig = cloneDefaultConfig()
      await writePrivateTextFileAtomic(
        controledMihomoConfigPath(),
        stringifyYaml(controledMihomoConfig)
      )
    }
  }
  if (typeof controledMihomoConfig !== 'object') controledMihomoConfig = cloneDefaultConfig()
  return controledMihomoConfig
}

export async function patchControledMihomoConfig(patch: Partial<MihomoConfig>): Promise<void> {
  const previousPromise = writePromise
  const currentPromise = (async () => {
    await previousPromise
    const currentConfig = structuredClone(await getControledMihomoConfig())
    const { controlDns = true, controlSniff = true } = await getAppConfig()
    if (!controlDns) {
      delete currentConfig.dns
      delete currentConfig.hosts
    } else {
      // 从不接管状态恢复
      if (currentConfig.dns?.ipv6 === undefined) {
        currentConfig.dns = structuredClone(defaultControledMihomoConfig.dns)
      }
    }
    if (!controlSniff) {
      delete currentConfig.sniffer
    } else {
      // 从不接管状态恢复
      if (!currentConfig.sniffer) {
        currentConfig.sniffer = structuredClone(defaultControledMihomoConfig.sniffer)
      }
    }
    if (patch.dns?.['nameserver-policy']) {
      currentConfig.dns = currentConfig.dns || {}
      currentConfig.dns['nameserver-policy'] = patch.dns['nameserver-policy']
    }
    if (patch.dns?.['proxy-server-nameserver-policy']) {
      currentConfig.dns = currentConfig.dns || {}
      currentConfig.dns['proxy-server-nameserver-policy'] =
        patch.dns['proxy-server-nameserver-policy']
    }
    if (patch.dns?.['use-hosts']) {
      currentConfig.hosts = patch.hosts
    }
    const nextConfig = deepMerge(currentConfig, structuredClone(patch))
    await generateProfile(nextConfig)
    await writePrivateTextFileAtomic(controledMihomoConfigPath(), stringifyYaml(nextConfig))
    controledMihomoConfig = nextConfig
  })()
  writePromise = currentPromise.catch(() => {})
  await currentPromise
}
