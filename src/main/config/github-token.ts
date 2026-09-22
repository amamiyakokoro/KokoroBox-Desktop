import { getAppConfig, removeLegacyAppSecret } from './app'
import { deleteSecureString, readSecureString, writeSecureString } from './secure-string'

let migrationPromise: Promise<string> | undefined
let migrationComplete = false

export async function getGitHubToken(): Promise<string> {
  migrationPromise ??= (async () => {
    const stored = await readSecureString('github-token')
    const legacy = (await getAppConfig()).githubToken
    if (!migrationComplete) {
      if (legacy && stored === null) await writeSecureString('github-token', legacy)
      await removeLegacyAppSecret('githubToken')
      migrationComplete = true
    }
    return stored ?? legacy ?? ''
  })().finally(() => {
    migrationPromise = undefined
  })
  return migrationPromise
}

export async function setGitHubToken(token: string): Promise<void> {
  await getGitHubToken()
  if (token.trim()) {
    await writeSecureString('github-token', token.trim())
  } else {
    await deleteSecureString('github-token')
  }
}

export async function isGitHubTokenConfigured(): Promise<boolean> {
  return Boolean(await getGitHubToken())
}
