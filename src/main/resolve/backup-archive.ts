import { assertManagedConfig } from '../../shared/managed-id'
import AdmZip from 'adm-zip'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { parseValidAppConfig } from '../config/app-loader'
import { parseAppRoutingConfig } from '../../shared/app-routing'
import { parseYaml, stringifyYaml } from '../utils/yaml'

const requiredFiles = ['config.yaml', 'mihomo.yaml', 'profile.yaml', 'override.yaml']
const optionalFiles = ['app-routing/config.json']
const folders = [
  'profiles',
  'override',
  'app-routing/icons',
  'backgrounds',
  'network-card-backgrounds'
]
const maxArchiveBytes = 512 * 1024 * 1024
const maxFileBytes = 256 * 1024 * 1024
const maxEntries = 10_000
const pendingFilename = '.pending-backup-restore.zip'

interface BackupEntry {
  name: string
  directory: boolean
  data: Buffer
}

function sanitizeConfig(content: Buffer): Buffer {
  const config = parseValidAppConfig(content.toString('utf8'))
  if (!config) throw new Error('Invalid backup configuration: config.yaml')
  // Legacy plaintext credentials must never be exported or imported. Encrypted
  // credentials and service identities are deliberately outside the archive.
  for (const key of ['githubToken', 'webdavPassword', 'gistAgeIdentity']) delete config[key]
  return Buffer.from(stringifyYaml(config))
}

function checkName(name: string): void {
  const segments = name.replace(/\/$/, '').split('/')
  if (
    !name ||
    name.includes('\\') ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        /[<>:"|?*]/.test(segment) ||
        [...segment].some((character) => character.charCodeAt(0) < 32) ||
        /[. ]$/.test(segment) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)
    )
  ) {
    throw new Error(`Invalid backup path: ${name}`)
  }
}

function allowedEntry(name: string, directory: boolean): boolean {
  if (!directory && [...requiredFiles, ...optionalFiles].includes(name)) return true
  if (directory && name === 'app-routing') return true
  return folders.some((folder) => name.startsWith(`${folder}/`) || (directory && name === folder))
}

function validateEntries(zip: AdmZip): BackupEntry[] {
  const entries = zip.getEntries()
  if (entries.length > maxEntries) throw new Error('Backup contains too many files')
  const names = new Set<string>()
  let totalBytes = 0
  const result = entries.map((entry): BackupEntry => {
    checkName(entry.entryName)
    const name = entry.entryName.replace(/\/$/, '')
    const normalized = name.toLowerCase()
    if (!allowedEntry(name, entry.isDirectory) || names.has(normalized)) {
      throw new Error(`Unsupported or duplicate backup entry: ${name}`)
    }
    names.add(normalized)
    if (((entry.attr >>> 16) & 0xf000) === 0xa000) {
      throw new Error(`Backup contains a symbolic link: ${name}`)
    }
    totalBytes += entry.header.size
    if (entry.header.size > maxFileBytes || totalBytes > maxArchiveBytes) {
      throw new Error('Backup exceeds the size limit')
    }
    const data = entry.isDirectory ? Buffer.alloc(0) : entry.getData()
    if (!entry.isDirectory && data.length !== entry.header.size) {
      throw new Error(`Invalid backup file size: ${name}`)
    }
    return { name, directory: entry.isDirectory, data }
  })
  for (const name of requiredFiles) {
    const file = result.find((entry) => entry.name === name && !entry.directory)
    if (!file) throw new Error(`Backup is missing ${name}`)
    const value = parseYaml<unknown>(file.data.toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Invalid backup configuration: ${name}`)
    }
    if (name === 'profile.yaml' || name === 'override.yaml') {
      assertManagedConfig(value, name === 'profile.yaml' ? 'profile' : 'override')
    }
    if (name === 'config.yaml') file.data = sanitizeConfig(file.data)
  }
  const routing = result.find((entry) => entry.name === 'app-routing/config.json')
  if (routing) parseAppRoutingConfig(JSON.parse(routing.data.toString('utf8')))
  // A file cannot also be a parent directory of another entry.
  for (const entry of result.filter((entry) => !entry.directory)) {
    if (
      result.some((other) => other.name.toLowerCase().startsWith(`${entry.name.toLowerCase()}/`))
    ) {
      throw new Error(`Conflicting backup path: ${entry.name}`)
    }
  }
  return result
}

export function validateBackupArchive(buffer: Buffer): void {
  if (buffer.length > maxArchiveBytes) throw new Error('Backup exceeds the size limit')
  validateEntries(new AdmZip(buffer))
}

function assertNoSymlinks(directory: string, relativeName: string): void {
  let current = directory
  for (const segment of relativeName.split('/')) {
    current = path.join(current, segment)
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`Backup path contains a symbolic link: ${relativeName}`)
    }
  }
}

export function createBackupArchive(directory: string): Buffer {
  const zip = new AdmZip()
  let totalBytes = 0
  let count = 0
  const add = (name: string): void => {
    checkName(name)
    assertNoSymlinks(directory, name)
    const source = path.join(directory, name)
    const stat = lstatSync(source)
    if (++count > maxEntries) throw new Error('Backup contains too many files')
    if (stat.isDirectory()) {
      zip.addFile(`${name}/`, Buffer.alloc(0))
      for (const child of readdirSync(source).sort()) {
        if (/\.(?:log|tmp|backup)$/i.test(child)) continue
        add(`${name}/${child}`)
      }
    } else if (stat.isFile()) {
      totalBytes += stat.size
      if (stat.size > maxFileBytes || totalBytes > maxArchiveBytes) {
        throw new Error('Backup exceeds the size limit')
      }
      const content = readFileSync(source)
      zip.addFile(name, name === 'config.yaml' ? sanitizeConfig(content) : content)
    } else {
      throw new Error(`Unsupported backup file: ${name}`)
    }
  }
  requiredFiles.forEach(add)
  for (const name of [...optionalFiles, ...folders]) {
    if (existsSync(path.join(directory, name))) add(name)
  }
  validateEntries(zip)
  return zip.toBuffer()
}

export function restoreBackupArchive(
  directory: string,
  buffer: Buffer,
  move: typeof renameSync = renameSync
): void {
  if (buffer.length > maxArchiveBytes) throw new Error('Backup exceeds the size limit')
  const entries = validateEntries(new AdmZip(buffer))
  const targets = [...requiredFiles, ...optionalFiles, ...folders].filter((name) =>
    entries.some((entry) => entry.name === name || entry.name.startsWith(`${name}/`))
  )
  // Also replace the recovery copies, so fallback cannot resurrect pre-restore settings.
  for (const name of ['config.yaml', 'app-routing/config.json']) {
    const entry = entries.find((entry) => entry.name === name)
    if (entry) {
      entries.push({ ...entry, name: `${name}.backup` })
      targets.push(`${name}.backup`)
    }
  }
  targets.forEach((name) => assertNoSymlinks(directory, name))
  const staging = mkdtempSync(path.join(directory, '.backup-restore-'))
  const installed: string[] = []
  const previous: string[] = []
  let preserveRecovery = false
  try {
    for (const entry of entries) {
      const target = path.join(staging, 'new', entry.name)
      mkdirSync(entry.directory ? target : path.dirname(target), { recursive: true })
      if (!entry.directory) writeFileSync(target, entry.data, { mode: 0o600 })
    }
    for (const name of targets) {
      const target = path.join(directory, name)
      const old = path.join(staging, 'old', name)
      mkdirSync(path.dirname(target), { recursive: true })
      if (existsSync(target)) {
        mkdirSync(path.dirname(old), { recursive: true })
        move(target, old)
        previous.push(name)
      }
      move(path.join(staging, 'new', name), target)
      installed.push(name)
    }
  } catch (error) {
    try {
      for (const name of installed.reverse()) {
        rmSync(path.join(directory, name), { recursive: true, force: true })
      }
      for (const name of previous.reverse())
        move(path.join(staging, 'old', name), path.join(directory, name))
    } catch (rollbackError) {
      preserveRecovery = true
      throw new AggregateError(
        [error, rollbackError],
        `Backup recovery files retained at ${staging}`
      )
    }
    throw error
  } finally {
    if (!preserveRecovery) rmSync(staging, { recursive: true, force: true })
  }
}

export function stageBackupRestore(directory: string, buffer: Buffer): void {
  validateBackupArchive(buffer)
  const pending = path.join(directory, pendingFilename)
  assertNoSymlinks(directory, pendingFilename)
  assertNoSymlinks(directory, `${pendingFilename}.tmp`)
  writeFileSync(`${pending}.tmp`, buffer, { mode: 0o600 })
  renameSync(`${pending}.tmp`, pending)
}

export function applyPendingBackupRestore(directory: string): boolean {
  const pending = path.join(directory, pendingFilename)
  if (!existsSync(pending)) return false
  assertNoSymlinks(directory, pendingFilename)
  if (lstatSync(pending).size > maxArchiveBytes) throw new Error('Backup exceeds the size limit')
  restoreBackupArchive(directory, readFileSync(pending))
  rmSync(pending)
  return true
}
