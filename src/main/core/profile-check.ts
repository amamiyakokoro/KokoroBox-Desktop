import { getAppConfig, getProfileConfig } from '../config'
import { mihomoCorePath, mihomoTestDir, mihomoWorkConfigPath } from '../utils/dirs'
import { validateMihomoProfile } from './profile-validation'

export async function checkProfile(serviceMode = false): Promise<void> {
  const [appConfig, profileConfig] = await Promise.all([getAppConfig(), getProfileConfig()])
  const { core = 'mihomo', diffWorkDir = false, safePaths = [] } = appConfig
  try {
    await validateMihomoProfile(
      {
        executable: mihomoCorePath(core),
        configPath: diffWorkDir
          ? mihomoWorkConfigPath(profileConfig.current)
          : mihomoWorkConfigPath('work'),
        workDir: mihomoTestDir(),
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
