import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { defaultAppRoutingConfig, validateAppRoutingConfig } from '../../shared/app-routing'
import { appRoutingConfigPath, appRoutingDir } from '../utils/dirs'

let cachedConfig: AppRoutingConfig | undefined
let writePromise: Promise<void> = Promise.resolve()

function cloneDefault(): AppRoutingConfig {
  return { ...defaultAppRoutingConfig, rules: [] }
}

async function readValidatedConfig(filePath: string): Promise<AppRoutingConfig> {
  const parsed = JSON.parse(await readFile(filePath, 'utf8')) as AppRoutingConfig
  validateAppRoutingConfig(parsed)
  return parsed
}

export async function getAppRoutingConfig(force = false): Promise<AppRoutingConfig> {
  if (!cachedConfig || force) {
    try {
      cachedConfig = await readValidatedConfig(appRoutingConfigPath())
    } catch {
      try {
        cachedConfig = await readValidatedConfig(`${appRoutingConfigPath()}.backup`)
      } catch {
        cachedConfig = cloneDefault()
      }
    }
  }
  return structuredClone(cachedConfig)
}

export async function saveAppRoutingConfig(config: AppRoutingConfig): Promise<AppRoutingConfig> {
  validateAppRoutingConfig(config)
  const next = structuredClone(config)
  const previous = writePromise
  const current = (async (): Promise<void> => {
    await previous
    await mkdir(appRoutingDir(), { recursive: true })
    const temporaryPath = `${appRoutingConfigPath()}.tmp`
    const backupPath = `${appRoutingConfigPath()}.backup`
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    if (existsSync(appRoutingConfigPath())) {
      await copyFile(appRoutingConfigPath(), backupPath)
      if (process.platform === 'win32') await unlink(appRoutingConfigPath())
    }
    await rename(temporaryPath, appRoutingConfigPath())
    cachedConfig = next
  })()
  writePromise = current.catch(() => {})
  await current
  return structuredClone(next)
}
