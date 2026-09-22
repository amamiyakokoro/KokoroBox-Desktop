import { appConfigPath } from '../utils/dirs'
import { stringifyYaml } from '../utils/yaml'
import { deepMerge } from '../utils/merge'
import { defaultConfig } from '../utils/template'
import { systemCoreDefaultPath, systemCoreOnlyBuild } from '../../shared/build-flags'
import { loadAppConfigFile, loadAppConfigFileSync, writeAppConfigFile } from './app-loader'

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

export function getAppConfigSync(): AppConfig {
  return applyBuildConfig(loadAppConfigFileSync(appConfigPath()) ?? cloneDefaultConfig())
}
