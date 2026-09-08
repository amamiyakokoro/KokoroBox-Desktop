const KOKOROBOX_GIST_FILE_NAME = 'kokorobox.yaml'
const KOKOROBOX_GIST_ENCRYPTED_FILE_NAME = 'kokorobox.yaml.age'
const LEGACY_GIST_FILE_NAME = 'sparkle.yaml'
const LEGACY_GIST_ENCRYPTED_FILE_NAME = 'sparkle.yaml.age'

export interface GistFileNames {
  fileName: string
  staleFileName: string
}

/**
 * Existing Gists retain their original filename so copied raw GitHub URLs do
 * not break during a branding upgrade. Newly created Gists use KokoroBox.
 */
export function resolveGistFileNames(
  files: Record<string, unknown> | undefined,
  encrypted: boolean
): GistFileNames {
  const names = new Set(Object.keys(files || {}))
  const usesKokoroBoxName =
    names.has(KOKOROBOX_GIST_FILE_NAME) || names.has(KOKOROBOX_GIST_ENCRYPTED_FILE_NAME)
  const usesLegacyName = names.has(LEGACY_GIST_FILE_NAME) || names.has(LEGACY_GIST_ENCRYPTED_FILE_NAME)
  const prefix = usesKokoroBoxName || !usesLegacyName ? 'kokorobox' : 'sparkle'
  const fileName = encrypted ? `${prefix}.yaml.age` : `${prefix}.yaml`
  const staleFileName = encrypted ? `${prefix}.yaml` : `${prefix}.yaml.age`
  return { fileName, staleFileName }
}

export function buildGistRawUrl(
  gistUrl: string,
  files: Record<string, unknown> | undefined,
  encrypted: boolean
): string {
  return `${gistUrl}/raw/${resolveGistFileNames(files, encrypted).fileName}`
}
