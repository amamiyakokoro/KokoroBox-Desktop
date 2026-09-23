import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isManagedHomeBackgroundFile } from '../../shared/home'
import { tr } from '../../shared/i18n'

const maximumImageBytes = 20 * 1024 * 1024

export function detectedHomeImageExtension(bytes: Buffer): 'png' | 'jpg' | 'webp' | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'webp'
  return undefined
}

export async function importManagedHomeBackground(
  originalPath: string,
  managedDirectory: string,
  validateImage: (bytes: Buffer) => void = () => {}
): Promise<string> {
  const size = (await stat(originalPath)).size
  if (size < 12 || size > maximumImageBytes)
    throw new Error(tr('Invalid or oversized background image'))
  const bytes = await readFile(originalPath)
  if (bytes.length > maximumImageBytes) throw new Error(tr('Background image is too large'))
  const extension = detectedHomeImageExtension(bytes)
  if (!extension) throw new Error(tr('Background image must be PNG, JPEG, or WebP'))
  validateImage(bytes)
  await mkdir(managedDirectory, { recursive: true })
  const file = `home-background-${randomBytes(16).toString('hex')}.${extension}`
  const temporaryPath = path.join(managedDirectory, `${file}.tmp`)
  try {
    await writeFile(temporaryPath, bytes, { flag: 'wx', mode: 0o600 })
    await rename(temporaryPath, path.join(managedDirectory, file))
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
  return file
}

export async function removeManagedHomeBackground(
  managedDirectory: string,
  file: unknown
): Promise<void> {
  if (!isManagedHomeBackgroundFile(file)) return
  await rm(path.join(managedDirectory, file), { force: true })
}

export async function readManagedHomeBackground(
  managedDirectory: string,
  file: unknown
): Promise<string | undefined> {
  if (!isManagedHomeBackgroundFile(file)) return undefined
  const filePath = path.join(managedDirectory, file)
  try {
    if ((await stat(filePath)).size > maximumImageBytes) return undefined
    const bytes = await readFile(filePath)
    if (bytes.length > maximumImageBytes || !detectedHomeImageExtension(bytes)) return undefined
    const mime = file.endsWith('.jpg') ? 'image/jpeg' : `image/${path.extname(file).slice(1)}`
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch {
    return undefined
  }
}
