import { tr } from '../../shared/i18n'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import path from 'path'
import { getAppConfig } from '../config/app'
import { mihomoCorePath, mihomoTestDir } from '../utils/dirs'

import { validateMihomoProfile } from '../core/profile-validation'

export async function validateMihomoProfileContent(content: string): Promise<void> {
  const appConfig = await getAppConfig()
  const { core = 'mihomo', safePaths = [], corePermissionMode = 'elevated' } = appConfig
  const testRoot = mihomoTestDir()
  await mkdir(testRoot, { recursive: true })
  const testDir = await mkdtemp(path.join(testRoot, 'kokoro-'))
  const configPath = path.join(testDir, 'config.yaml')

  try {
    await writeFile(configPath, content, { encoding: 'utf-8', mode: 0o600 })
    await validateMihomoProfile(
      {
        executable: mihomoCorePath(core),
        configPath,
        workDir: testDir,
        safePaths
      },
      corePermissionMode === 'service'
    )
  } catch (error) {
    if (!(error instanceof Error)) throw error
    throw new Error(tr('Kokoro configuration validation failed: {0}', [error.message]), {
      cause: error
    })
  } finally {
    await rm(testDir, { recursive: true, force: true })
  }
}
