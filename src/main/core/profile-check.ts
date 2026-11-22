import { getAppConfig, getProfileConfig } from '../config'
import { dirname } from 'node:path'
import { mihomoCorePath, mihomoWorkConfigPath } from '../utils/dirs'
import { validateMihomoProfile } from './profile-validation'

export async function checkProfile(serviceMode = false): Promise<void> {
  const [appConfig, profileConfig] = await Promise.all([getAppConfig(), getProfileConfig()])
  const { core = 'mihomo', diffWorkDir = false, safePaths = [] } = appConfig
  const configPath = mihomoWorkConfigPath(profileConfig.current, diffWorkDir)
  try {
    await validateMihomoProfile(
      {
        executable: mihomoCorePath(core),
        configPath,
        workDir: dirname(configPath),
        safePaths
      },
      serviceMode
    )
  } catch (error) {
    throw new Error(
      `Profile Check Failed:\n${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
}
