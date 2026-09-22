import { getAppConfig, removeLegacyAppSecret } from './app'
import { deleteSecureString, readSecureString, writeSecureString } from './secure-string'

let migrationPromise: Promise<string> | undefined
let migrationComplete = false

export async function getWebdavPassword(): Promise<string> {
  migrationPromise ??= (async () => {
    const stored = await readSecureString('webdav-password')
    const legacy = (await getAppConfig()).webdavPassword
    if (!migrationComplete) {
      if (legacy && stored === null) await writeSecureString('webdav-password', legacy)
      await removeLegacyAppSecret('webdavPassword')
      migrationComplete = true
    }
    return stored ?? legacy ?? ''
  })().finally(() => {
    migrationPromise = undefined
  })
  return migrationPromise
}

export async function setWebdavPassword(password: string): Promise<void> {
  await getWebdavPassword()
  if (password) {
    await writeSecureString('webdav-password', password)
  } else {
    await deleteSecureString('webdav-password')
  }
}

export async function isWebdavPasswordConfigured(): Promise<boolean> {
  return Boolean(await getWebdavPassword())
}
