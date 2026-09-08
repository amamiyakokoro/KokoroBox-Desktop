/**
 * Product-owned identifiers.  Legacy identifiers belong here only while an
 * upgrade still needs to recognize an installation created by Sparkle.
 *
 * Do not use the legacy values for new registrations.
 */
export const productIdentity = {
  name: 'KokoroBox',
  userDataDirectory: 'KokoroBox',
  legacyUserDataDirectories: ['sparkle'],
  uriScheme: 'kokorobox',
  legacyUriSchemes: ['sparkle']
} as const

/** Configuration-import URI schemes handled outside the Kokoro OAuth callback. */
export const configUriSchemes = [
  'clash',
  'mihomo',
  productIdentity.uriScheme,
  ...productIdentity.legacyUriSchemes
] as const

export function isConfigUri(value: string): boolean {
  const normalized = value.toLowerCase()
  return configUriSchemes.some((scheme) => normalized.startsWith(`${scheme}://`))
}
