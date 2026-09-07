export interface MacOSBundleVersion {
  marketingVersion: string
  bundleVersion: string
}

const supportedVersion =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(0|[1-9]\d*)|rolling-([0-9a-f]{7,40})))?$/

/** Convert KokoroBox release versions into numeric values accepted by Xcode. */
export function macOSBundleVersion(packageVersion: string): MacOSBundleVersion {
  const parts = supportedVersion.exec(packageVersion)
  if (!parts) throw new Error(`Unsupported macOS bundle version: ${packageVersion}`)

  const [, major, minor, patch, numericRevision, rollingCommit] = parts
  const revision = rollingCommit
    ? Number(BigInt(`0x${rollingCommit}`) % 1000n)
    : Number(numericRevision ?? 0)

  return {
    marketingVersion: `${major}.${minor}.${patch}`,
    bundleVersion: `${major}.${minor}.${Number(patch) * 1000 + revision}`
  }
}
