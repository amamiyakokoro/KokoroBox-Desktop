import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringify } from 'yaml'

export interface Target {
  os: string
  arch: string
  format: string
}

export interface MacSigningReceipt {
  status: 'apple-notarized'
  teamId: string
  notarizationId: string
  version: string
  sha: string
  filename: string
  checksum: string
}

interface ProcessRouterSbomReceipt {
  filename: string
  checksum: string
  proxyBridgeRevision: string
}

const proxyBridgeRevision = '02703a0672a8b94011a4698368a392f7734c10dc'
const winDivertArchiveSha256 = '63cb41763bb4b20f600b6de04e991a9c2be73279e317d4d82f237b150c5f3f15'

function processRouterSbomName(version: string): string {
  return `kokorobox-process-router-${version}.cdx.json`
}

function validateProcessRouterSbom(file: string): void {
  const sbom = JSON.parse(readFileSync(file, 'utf8')) as {
    bomFormat?: string
    specVersion?: string
    metadata?: { properties?: { name?: string; value?: string }[] }
  }
  const revision = sbom.metadata?.properties?.find(
    (property) => property.name === 'kokorobox:proxybridge-revision'
  )?.value
  const winDivertHash = sbom.metadata?.properties?.find(
    (property) => property.name === 'kokorobox:windivert-archive-sha256'
  )?.value
  if (
    sbom.bomFormat !== 'CycloneDX' ||
    sbom.specVersion !== '1.6' ||
    revision !== proxyBridgeRevision ||
    winDivertHash !== winDivertArchiveSha256
  ) {
    throw new Error('Invalid process router SBOM provenance')
  }
}

export function validateMacReceipt(
  receipt: MacSigningReceipt | undefined,
  version: string,
  sha: string,
  filename: string,
  checksum: string
) {
  if (
    !receipt ||
    receipt.status !== 'apple-notarized' ||
    !/^[A-Z0-9]{10}$/.test(receipt.teamId) ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(receipt.notarizationId) ||
    receipt.version !== version ||
    receipt.sha !== sha ||
    receipt.filename !== filename ||
    receipt.checksum !== checksum
  ) {
    throw new Error('Missing or mismatched macOS signing/notarization verification receipt')
  }
}
export const releaseTargets: Target[] = [
  ...['x64', 'arm64'].flatMap((arch) =>
    ['7z', 'nsis'].map((format) => ({ os: 'windows-latest', arch, format }))
  ),
  ...['x64', 'arm64'].flatMap((arch) =>
    ['deb', 'rpm', 'pacman'].map((format) => ({ os: 'ubuntu-latest', arch, format }))
  ),
  ...['x64', 'arm64'].map((arch) => ({ os: 'macos-latest', arch, format: 'pkg' }))
]

export function targetId(target: Target): string {
  if (
    !releaseTargets.some(
      (item) => item.os === target.os && item.arch === target.arch && item.format === target.format
    )
  ) {
    throw new Error('Unsupported release target')
  }
  return `${target.os}-${target.arch}-${target.format}`
}

export function artifactName(target: Target, version: string): string {
  targetId(target)
  if (!/^\d+\.\d+\.\d+(?:-\d+|-rolling-[0-9a-f]{7})?$/.test(version))
    throw new Error('Invalid artifact version')
  const prefix = `kokorobox-desktop-${target.os.split('-')[0]}-${version}`
  if (target.os === 'windows-latest')
    return `${prefix}-${target.arch}-${target.format === 'nsis' ? 'setup.exe' : 'portable.7z'}`
  if (target.os === 'macos-latest') return `${prefix}-${target.arch}.pkg`
  const arch =
    target.format === 'deb'
      ? { x64: 'amd64', arm64: 'arm64' }[target.arch]
      : target.format === 'rpm'
        ? { x64: 'x86_64', arm64: 'aarch64' }[target.arch]
        : target.arch === 'arm64'
          ? 'aarch64'
          : target.arch
  return `kokorobox-desktop-linux-${version}-${arch}.${target.format === 'pacman' ? 'pkg.tar.zst' : target.format}`
}

function digest(file: string): string {
  const stat = lstatSync(file)
  if (!stat.isFile() || stat.size === 0)
    throw new Error(`Not a non-empty regular artifact: ${file}`)
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export function stageArtifact(
  target: Target,
  version: string,
  sha: string,
  source: string,
  output: string,
  signing?: MacSigningReceipt,
  processRouterSbom?: string
) {
  const filename = artifactName(target, version)
  const checksum = digest(path.join(source, filename))
  if (target.os === 'macos-latest') validateMacReceipt(signing, version, sha, filename, checksum)
  const includesProcessRouterSbom =
    target.os === 'windows-latest' && target.arch === 'x64' && target.format === 'nsis'
  let sbom: ProcessRouterSbomReceipt | undefined
  if (includesProcessRouterSbom) {
    if (!processRouterSbom) throw new Error('Missing Windows x64 process router SBOM')
    validateProcessRouterSbom(processRouterSbom)
    sbom = {
      filename: processRouterSbomName(version),
      checksum: digest(processRouterSbom),
      proxyBridgeRevision
    }
  } else if (processRouterSbom) {
    throw new Error('Process router SBOM supplied for the wrong release target')
  }
  mkdirSync(output, { recursive: true })
  copyFileSync(path.join(source, filename), path.join(output, filename))
  if (sbom) copyFileSync(processRouterSbom!, path.join(output, sbom.filename))
  writeFileSync(
    path.join(output, `manifest-${targetId(target)}.json`),
    JSON.stringify({ target, version, sha, filename, checksum, signing, sbom })
  )
}

export function collectArtifacts(
  version: string,
  tag: string,
  sha: string,
  source: string,
  output: string,
  changelog: string
) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid source commit SHA')
  if (tag !== 'rolling' && tag !== version && tag !== `v${version}`)
    throw new Error('Release tag does not match version')
  if ((tag === 'rolling') !== version.includes('-rolling-'))
    throw new Error('Release channel does not match version')
  const filenames: string[] = []
  const supplementalFilenames: string[] = []
  const expectedFiles = new Set<string>()
  // Validate the entire matrix before creating any publication output.
  for (const target of releaseTargets) {
    const manifestName = `manifest-${targetId(target)}.json`
    const manifest = JSON.parse(readFileSync(path.join(source, manifestName), 'utf8'))
    const filename = artifactName(target, version)
    if (
      targetId(manifest.target) !== targetId(target) ||
      manifest.version !== version ||
      manifest.sha !== sha ||
      manifest.filename !== filename
    ) {
      throw new Error(`Artifact provenance mismatch: ${manifestName}`)
    }
    if (digest(path.join(source, filename)) !== manifest.checksum)
      throw new Error(`Checksum mismatch: ${filename}`)
    if (target.os === 'macos-latest')
      validateMacReceipt(manifest.signing, version, sha, filename, manifest.checksum)
    const includesProcessRouterSbom =
      target.os === 'windows-latest' && target.arch === 'x64' && target.format === 'nsis'
    if (includesProcessRouterSbom) {
      const sbomName = processRouterSbomName(version)
      if (
        !existsSync(path.join(source, sbomName)) ||
        manifest.sbom?.filename !== sbomName ||
        manifest.sbom?.proxyBridgeRevision !== proxyBridgeRevision ||
        digest(path.join(source, sbomName)) !== manifest.sbom?.checksum
      ) {
        throw new Error('Missing or mismatched process router SBOM')
      }
      validateProcessRouterSbom(path.join(source, sbomName))
      supplementalFilenames.push(sbomName)
      expectedFiles.add(sbomName)
    } else if (manifest.sbom) {
      throw new Error(`Unexpected process router SBOM: ${manifestName}`)
    }
    filenames.push(filename)
    expectedFiles.add(filename).add(manifestName)
  }
  if (readdirSync(source).some((name) => !expectedFiles.has(name)))
    throw new Error('Unexpected release artifacts')
  mkdirSync(output, { recursive: true })
  if (readdirSync(output).length !== 0) throw new Error('Release output directory must be empty')
  for (const filename of [...filenames, ...supplementalFilenames])
    copyFileSync(path.join(source, filename), path.join(output, filename))
  const checksums =
    [...filenames, ...supplementalFilenames]
      .sort()
      .map((filename) => `${digest(path.join(output, filename))}  ${filename}`)
      .join('\n') + '\n'
  writeFileSync(path.join(output, 'SHA256SUMS'), checksums)
  const notes = `${changelog.trim()}\n\n## Signing status\n\nmacOS PKG installers are Developer ID-signed, notarized by Apple, and include a stapled notarization ticket. Windows packages are not Authenticode-signed. SHA256SUMS provides integrity checks, not publisher authentication.\n`
  writeFileSync(path.join(output, 'changelog.md'), notes)
  writeFileSync(path.join(output, 'latest.yml'), stringify({ version, tag, changelog: notes }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.env.RELEASE_VERSION ?? ''
  const sha = process.env.GITHUB_SHA ?? ''
  if (process.argv[2] === 'stage') {
    stageArtifact(
      {
        os: process.env.TARGET_OS ?? '',
        arch: process.env.TARGET_ARCH ?? '',
        format: process.env.TARGET_FORMAT ?? ''
      },
      version,
      sha,
      'dist',
      'dist/release-artifacts',
      process.env.TARGET_OS === 'macos-latest'
        ? JSON.parse(readFileSync(`dist/macos-signing-${process.env.TARGET_ARCH}.json`, 'utf8'))
        : undefined,
      process.env.TARGET_OS === 'windows-latest' &&
        process.env.TARGET_ARCH === 'x64' &&
        process.env.TARGET_FORMAT === 'nsis'
        ? 'extra/files/process-router/process-router-sbom.cdx.json'
        : undefined
    )
  } else if (process.argv[2] === 'collect') {
    collectArtifacts(
      version,
      process.env.RELEASE_TAG ?? '',
      sha,
      'bin',
      'dist/release',
      readFileSync('changelog.md', 'utf8')
    )
  } else {
    throw new Error('Expected stage or collect')
  }
}
