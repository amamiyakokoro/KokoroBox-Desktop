import { appConfigPath } from '../utils/dirs'
import { stringifyYaml } from '../utils/yaml'
import { deepMerge } from '../utils/merge'
import { defaultConfig } from '../utils/template'
import { systemCoreDefaultPath, systemCoreOnlyBuild } from '../../shared/build-flags'
import {
  loadAppConfigFile,
  loadAppConfigFileSync,
  parseValidAppConfig,
  writeAppConfigFile
} from './app-loader'
import { readFile } from 'node:fs/promises'
import { writePrivateTextFileAtomic } from './atomic-file'

let appConfig: AppConfig
let writePromise: Promise<void> = Promise.resolve()

function cloneDefaultConfig(): AppConfig {
  return structuredClone(defaultConfig)
}

function applyBuildConfig(config: AppConfig): AppConfig {
  if (!systemCoreOnlyBuild) return config

  return {
    ...config,
    core: 'system',
    systemCorePath: config.systemCorePath || systemCoreDefaultPath
  }
}

export async function getAppConfig(force = false): Promise<AppConfig> {
  if (force || !appConfig) {
    appConfig = (await loadAppConfigFile(appConfigPath())) ?? cloneDefaultConfig()
  }
  if (typeof appConfig !== 'object') appConfig = cloneDefaultConfig()
  appConfig = applyBuildConfig(appConfig)
  return appConfig
}

export async function patchAppConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const previousPromise = writePromise
  const currentPromise = (async () => {
    await previousPromise
    const currentConfig = await getAppConfig()
    const nextConfig = applyBuildConfig(
      deepMerge(structuredClone(currentConfig), structuredClone(patch))
    )
    await writeAppConfigFile(appConfigPath(), stringifyYaml(nextConfig))
    appConfig = nextConfig
  })()
  writePromise = currentPromise.catch(() => {})
  await currentPromise
  return appConfig
}

export type LegacyAppSecretKey = 'githubToken' | 'webdavPassword' | 'gistAgeIdentity'

export async function removeLegacyAppSecret(key: LegacyAppSecretKey): Promise<void> {
  const previousPromise = writePromise
  const currentPromise = (async () => {
    await previousPromise
    const currentConfig = await getAppConfig()
    if (currentConfig[key]) {
      const nextConfig = structuredClone(currentConfig)
      delete nextConfig[key]
      await writeAppConfigFile(appConfigPath(), stringifyYaml(nextConfig))
      appConfig = nextConfig
    }
    const backupPath = `${appConfigPath()}.backup`
    try {
      const backup = parseValidAppConfig(await readFile(backupPath, 'utf8'))
      if (backup?.[key]) {
        delete backup[key]
        await writePrivateTextFileAtomic(backupPath, stringifyYaml(backup))
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  })()
  writePromise = currentPromise.catch(() => {})
  await currentPromise
}

export function getAppConfigSync(): AppConfig {
  return applyBuildConfig(loadAppConfigFileSync(appConfigPath()) ?? cloneDefaultConfig())
}
