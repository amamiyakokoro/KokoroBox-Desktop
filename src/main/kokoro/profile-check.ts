import { tr } from '../../shared/i18n'
import { execFile } from 'child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import { getAppConfig } from '../config/app'
import { mihomoCorePath, mihomoTestDir } from '../utils/dirs'

const execFilePromise = promisify(execFile)

export async function validateMihomoProfileContent(content: string): Promise<void> {
  const appConfig = await getAppConfig()
  const { core = 'mihomo', safePaths = [] } = appConfig
  const testRoot = mihomoTestDir()
  await mkdir(testRoot, { recursive: true })
  const testDir = await mkdtemp(path.join(testRoot, 'kokoro-'))
  const configPath = path.join(testDir, 'config.yaml')

  try {
    await writeFile(configPath, content, { encoding: 'utf-8', mode: 0o600 })
    await execFilePromise(mihomoCorePath(core), ['-t', '-f', configPath, '-d', testDir], {
      env: { ...process.env, SAFE_PATHS: safePaths.join(path.delimiter) }
    })
  } catch (error) {
    if (!(error instanceof Error)) throw error
    const execError = error as Error & { stdout?: string; stderr?: string }
    const output = [execError.stdout, execError.stderr]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n')
    const errorLines = output
      .split('\n')
      .filter((line) => line.includes('level=error'))
      .map((line) => line.split('level=error', 2)[1]?.trim() || line.trim())
    throw new Error(
      tr('Kokoro 配置校验失败：{0}', [errorLines.join('\n') || output.trim() || error.message])
    )
  } finally {
    await rm(testDir, { recursive: true, force: true })
  }
}
