import path from 'path'

function readBuildEnvironment(currentName: string, legacyName: string): string {
  return process.env[currentName]?.trim() || process.env[legacyName]?.trim() || ''
}

// SPARKLE_* remains an upgrade alias for downstream package recipes.  New
// build definitions must use KOKOROBOX_* so no new packaging contract adopts
// the former product name.
const systemCoreBuildValue = readBuildEnvironment('KOKOROBOX_SYSTEM_CORE', 'SPARKLE_SYSTEM_CORE')
const configuredSystemCorePath =
  systemCoreBuildValue === '1' ? '/usr/bin/mihomo' : systemCoreBuildValue
const systemServiceBuildValue = readBuildEnvironment(
  'KOKOROBOX_SYSTEM_SERVICE',
  'SPARKLE_SYSTEM_SERVICE'
)
const configuredSystemServicePath =
  !systemServiceBuildValue || systemServiceBuildValue === '1'
    ? '/usr/bin/kokorobox-service'
    : systemServiceBuildValue

if (
  process.platform === 'linux' &&
  configuredSystemCorePath &&
  !path.isAbsolute(configuredSystemCorePath)
) {
  throw new Error('KOKOROBOX_SYSTEM_CORE must be 1 or an absolute path')
}

if (
  process.platform === 'linux' &&
  systemCoreBuildValue &&
  !path.isAbsolute(configuredSystemServicePath)
) {
  throw new Error('KOKOROBOX_SYSTEM_SERVICE must be 1 or an absolute path')
}

export const systemCoreDefaultPath = process.platform === 'linux' ? configuredSystemCorePath : ''
export const systemCoreOnlyBuild = systemCoreDefaultPath !== ''
export const systemServicePath = systemCoreOnlyBuild ? configuredSystemServicePath : ''
