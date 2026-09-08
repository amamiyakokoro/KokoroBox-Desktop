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
