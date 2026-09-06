import path from 'path'
import { realpath, stat } from 'fs/promises'
import { normalizeAppRoutingConfig, validateAppRoutingConfig } from '../../shared/app-routing'

export async function prepareAppRoutingConfig(config: AppRoutingConfig): Promise<AppRoutingConfig> {
  validateAppRoutingConfig(config)
  const rules = await Promise.all(
    config.rules.map(async (rule) => {
      const executablePath = await realpath(rule.executablePath)
      const file = await stat(executablePath)
      if (!file.isFile() || path.extname(executablePath).toLowerCase() !== '.exe') {
        throw new Error('Application routing requires an existing .exe file')
      }
      return {
        ...rule,
        executablePath,
        processName: path.win32.basename(executablePath)
      }
    })
  )
  const prepared = normalizeAppRoutingConfig({ ...config, rules })
  validateAppRoutingConfig(prepared)
  return prepared
}
