import { copyFile, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { parseYaml } from '../utils/yaml'

export function parseValidAppConfig(content: string): AppConfig | undefined {
  try {
    const parsed = parseYaml<unknown>(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const config = parsed as Partial<AppConfig>
    if (!config.sysProxy || typeof config.sysProxy !== 'object' || Array.isArray(config.sysProxy)) {
      return undefined
    }
    return config as AppConfig
  } catch {
    return undefined
  }
}

export async function loadAppConfigFile(configPath: string): Promise<AppConfig | undefined> {
  for (const candidate of [configPath, `${configPath}.backup`]) {
    try {
      const config = parseValidAppConfig(await readFile(candidate, 'utf8'))
      if (config) return config
    } catch {
      // A missing or unreadable candidate should not prevent backup recovery.
    }
  }
  return undefined
}

export function loadAppConfigFileSync(configPath: string): AppConfig | undefined {
  for (const candidate of [configPath, `${configPath}.backup`]) {
    try {
      const config = parseValidAppConfig(readFileSync(candidate, 'utf8'))
      if (config) return config
    } catch {
      // A missing or unreadable candidate should not prevent backup recovery.
    }
  }
  return undefined
}

export async function writeAppConfigFile(
  configPath: string,
  content: string,
  platform = process.platform
): Promise<void> {
  const tmpPath = `${configPath}.tmp`
  const backupPath = `${configPath}.backup`

  try {
    await writeFile(tmpPath, content, 'utf8')
    if (existsSync(configPath)) {
      let primaryIsValid = false
      try {
        primaryIsValid = !!parseValidAppConfig(await readFile(configPath, 'utf8'))
      } catch {
        // Preserve the existing backup when the primary cannot be read.
      }
      if (primaryIsValid) await copyFile(configPath, backupPath)
      if (platform === 'win32') await unlink(configPath)
    }
    await rename(tmpPath, configPath)
  } catch (error) {
    try {
      await unlink(tmpPath)
    } catch {
      // The temporary file may not have been created.
    }
    throw error
  }
}
