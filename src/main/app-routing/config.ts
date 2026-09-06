import { copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'
import {
  defaultAppRoutingConfig,
  migrateAppRoutingConfig,
  normalizeAppRoutingConfig,
  validateAppRoutingConfig
} from '../../shared/app-routing'
import { appRoutingConfigPath, appRoutingDir, appRoutingIconDir } from '../utils/dirs'

let cachedConfig: AppRoutingConfig | undefined
let writePromise: Promise<void> = Promise.resolve()

function cloneDefault(): AppRoutingConfig {
  return { ...defaultAppRoutingConfig, rules: [] }
}

async function readValidatedConfig(filePath: string): Promise<AppRoutingConfig> {
  return migrateAppRoutingConfig(JSON.parse(await readFile(filePath, 'utf8')))
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
  const next = normalizeAppRoutingConfig(structuredClone(config))
  validateAppRoutingConfig(next)
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
    const activeIcons = new Set(
      next.rules.map(
        (rule) =>
          `${crypto.createHash('sha256').update(rule.executablePath.toLowerCase()).digest('hex')}.png`
      )
    )
    for (const file of await readdir(appRoutingIconDir()).catch(() => [] as string[])) {
      if (/^[a-f0-9]{64}\.png$/.test(file) && !activeIcons.has(file)) {
        await unlink(path.join(appRoutingIconDir(), file)).catch(() => {})
      }
    }
  })()
  writePromise = current.catch(() => {})
  await current
  return structuredClone(next)
}
