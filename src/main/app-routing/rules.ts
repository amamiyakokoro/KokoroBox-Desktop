import path from 'path'
import { realpath, stat } from 'fs/promises'
import {
  normalizeAppRoutingConfig,
  normalizeWindowsExecutablePath,
  validateAppRoutingConfig
} from '../../shared/app-routing'

export async function prepareAppRoutingConfig(config: AppRoutingConfig): Promise<AppRoutingConfig> {
  validateAppRoutingConfig(config)
  const rules = await Promise.all(
    config.rules.map(async (rule) => {
      const executablePath = normalizeWindowsExecutablePath(await realpath(rule.executablePath))
      const file = await stat(executablePath)
      if (!file.isFile() || path.extname(executablePath).toLowerCase() !== '.exe') {
        throw new Error('Application routing requires an existing .exe file')
      }
      return {
        ...rule,
        executablePath,
        executableName: path.win32.basename(executablePath)
      }
    })
  )
  const prepared = normalizeAppRoutingConfig({ ...config, rules })
  validateAppRoutingConfig(prepared)
  return prepared
}
