import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function normalizeVersion(value: string): string {
  const version = value.replace(/^v/, '')
  if (!stableVersion.test(version)) throw new Error(`Invalid stable version: ${value}`)
  return version
}

export function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a).split('.').map(Number)
  const right = normalizeVersion(b).split('.').map(Number)
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}

interface PlanOptions {
  event: string
  packageVersion: string
  sha: string
  inputVersion?: string
  inputTag?: string
  refName?: string
  stableTags?: string[]
  hasChanges?: boolean
  now?: Date
}

export function planRelease(options: PlanOptions) {
  const packageVersion = normalizeVersion(options.packageVersion)
  if (!/^[0-9a-f]{40}$/.test(options.sha)) throw new Error('Invalid source commit SHA')
  const tags = (options.stableTags ?? []).filter((tag) => stableVersion.test(tag.replace(/^v/, '')))
  tags.sort(compareVersions)
  const latestTag = tags.at(-1)
  const base =
    latestTag && compareVersions(latestTag, packageVersion) > 0
      ? normalizeVersion(latestTag)
      : packageVersion
  const nextPatch = (version: string) => {
    const [major, minor, patch] = version.split('.').map(Number)
    return `${major}.${minor}.${patch + 1}`
  }

  if (options.event === 'rolling') {
    return {
      should_release: true,
      version: `${nextPatch(base)}-rolling-${options.sha.slice(0, 7)}`,
      tag: 'rolling'
    }
  }

  let version: string
  let tag: string
  if (options.event === 'schedule') {
    // GitHub schedules use UTC. Allow a delayed run on the following first day in Taipei.
    const local = new Date((options.now ?? new Date()).getTime() + 8 * 60 * 60 * 1000)
    const tomorrow = new Date(local.getTime() + 24 * 60 * 60 * 1000)
    if (
      (local.getUTCMonth() === tomorrow.getUTCMonth() && local.getUTCDate() !== 1) ||
      options.hasChanges === false
    ) {
      return { should_release: false, version: '', tag: '' }
    }
    version =
      !latestTag || compareVersions(packageVersion, latestTag) > 0
        ? packageVersion
        : nextPatch(base)
    tag = `v${version}`
  } else if (options.event === 'push') {
    tag = options.refName ?? ''
    version = normalizeVersion(tag)
  } else if (options.event === 'workflow_dispatch') {
    version = normalizeVersion(options.inputVersion || packageVersion)
    tag = options.inputTag || `v${version}`
    if (normalizeVersion(tag) !== version)
      throw new Error('Release tag must match the release version')
  } else {
    throw new Error(`Unsupported release event: ${options.event}`)
  }
  return { should_release: true, version, tag }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  const stableTags = git('tag', '--merged', 'HEAD')
    .split('\n')
    .filter((tag) => stableVersion.test(tag.replace(/^v/, '')))
    .sort(compareVersions)
  const latestTag = stableTags.at(-1)
  const plan = planRelease({
    event: process.env.RELEASE_EVENT ?? '',
    packageVersion: JSON.parse(readFileSync('package.json', 'utf8')).version,
    sha: process.env.GITHUB_SHA ?? '',
    inputVersion: process.env.INPUT_VERSION,
    inputTag: process.env.INPUT_TAG,
    refName: process.env.REF_NAME,
    stableTags,
    hasChanges: !latestTag || git('rev-list', `${latestTag}..HEAD`, '--count') !== '0'
  })
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(plan)
      .map(([key, value]) => `${key}=${value}\n`)
      .join('')
  )
  console.log(JSON.stringify(plan))
}
