import { ageIdentityToRecipient, generateAgeKeyPair } from '../utils/age'
import { getAppConfig, patchAppConfig, removeLegacyAppSecret } from './app'
import { deleteSecureString, readSecureString, writeSecureString } from './secure-string'

let migrationPromise: Promise<string> | undefined
let migrationComplete = false

export async function getGistAgeIdentity(): Promise<string> {
  migrationPromise ??= (async () => {
    const stored = await readSecureString('gist-age-identity')
    const legacy = (await getAppConfig()).gistAgeIdentity
    if (!migrationComplete) {
      if (legacy && stored === null) await writeSecureString('gist-age-identity', legacy)
      await removeLegacyAppSecret('gistAgeIdentity')
      migrationComplete = true
    }
    return stored ?? legacy ?? ''
  })().finally(() => {
    migrationPromise = undefined
  })
  return migrationPromise
}

export async function isGistAgeIdentityConfigured(): Promise<boolean> {
  return Boolean(await getGistAgeIdentity())
}

async function replaceGistAgeIdentity(identity: string, recipient?: string): Promise<string> {
  const previousIdentity = await getGistAgeIdentity()
  if (identity) {
    await writeSecureString('gist-age-identity', identity)
  } else {
    await deleteSecureString('gist-age-identity')
  }
  try {
    if (recipient !== undefined) await patchAppConfig({ gistAgeRecipient: recipient })
  } catch (error) {
    if (previousIdentity) {
      await writeSecureString('gist-age-identity', previousIdentity)
    } else {
      await deleteSecureString('gist-age-identity')
    }
    throw error
  }
  return recipient ?? (await getAppConfig()).gistAgeRecipient ?? ''
}

export async function setGistAgeIdentity(identity: string): Promise<string> {
  const normalized = identity.trim()
  const recipient = normalized ? await ageIdentityToRecipient(normalized) : undefined
  return replaceGistAgeIdentity(normalized, recipient)
}

export async function generateAndSaveGistAgeIdentity(): Promise<string> {
  const pair = await generateAgeKeyPair()
  return replaceGistAgeIdentity(pair.identity, pair.recipient)
}

export async function deriveStoredGistAgeRecipient(): Promise<string> {
  const recipient = await ageIdentityToRecipient(await getGistAgeIdentity())
  await patchAppConfig({ gistAgeRecipient: recipient })
  return recipient
}
