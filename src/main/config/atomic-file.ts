import { chmod, rename, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

export async function writePrivateTextFileAtomic(
  filePath: string,
  content: string,
  platform = process.platform
): Promise<void> {
  const temporaryPath = `${filePath}.tmp`
  try {
    await writeFile(
      temporaryPath,
      content,
      platform === 'win32' ? 'utf8' : { encoding: 'utf8', mode: 0o600 }
    )
    if (platform !== 'win32') await chmod(temporaryPath, 0o600)
    if (platform === 'win32' && existsSync(filePath)) await unlink(filePath)
    await rename(temporaryPath, filePath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    throw error
  }
}
