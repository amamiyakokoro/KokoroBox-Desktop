export interface MacOSBundleVersion {
  marketingVersion: string
  bundleVersion: string
}

const supportedVersion =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(0|[1-9]\d*)|rolling-([0-9a-f]{7,40})))?$/

// Older releases encoded the semantic patch and a truncated commit hash in
// CFBundleVersion. Reserve a higher range so the first build using the new
// monotonic counter upgrades every installation using that legacy scheme.
const publishedBuildEpoch = 1_000_000n
const maximumSourceBuildNumber = 999_999n

/** Convert KokoroBox release versions into numeric values accepted by Xcode. */
export function macOSBundleVersion(
  packageVersion: string,
  sourceBuildNumber?: string
): MacOSBundleVersion {
  const parts = supportedVersion.exec(packageVersion)
  if (!parts) throw new Error(`Unsupported macOS bundle version: ${packageVersion}`)

  const [, major, minor, patch, numericRevision, rollingCommit] = parts
  if (sourceBuildNumber !== undefined) {
    if (!/^[1-9]\d*$/.test(sourceBuildNumber)) {
      throw new Error('Invalid macOS source build number')
    }
    const build = BigInt(sourceBuildNumber)
    if (build > maximumSourceBuildNumber) {
      throw new Error('macOS source build number exceeds its reserved range')
    }
    return {
      marketingVersion: `${major}.${minor}.${patch}`,
      bundleVersion: String(publishedBuildEpoch + build)
    }
  }
  if (rollingCommit) {
    throw new Error('Rolling macOS builds require a monotonic source build number')
  }
  const revision = Number(numericRevision ?? 0)

  return {
    marketingVersion: `${major}.${minor}.${patch}`,
    bundleVersion: `${major}.${minor}.${Number(patch) * 1000 + revision}`
  }
}
