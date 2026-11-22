import { open, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertManagedConfig, assertManagedId } from '../../shared/managed-id'
import { parseYaml } from '../utils/yaml'

const journalName = '.profile-key-update.json'
let pending: Promise<unknown> = Promise.resolve()
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation)
  pending = result.catch(() => undefined)
  return result
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export async function writeDurableText(target: string, content: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, target)
    await syncDirectory(dirname(target))
  } finally {
    await rm(temporary, { force: true })
  }
}

export interface SubscriptionRuntimeFile {
  perProfile: boolean
  content: string
}

interface Journal {
  version: 1
  runtime?: SubscriptionRuntimeFile
  id: string
  config: string
  content: string | null // null for a selection-only transaction
}
function validateJournal(value: unknown): Journal {
  if (!value || typeof value !== 'object') throw new Error('Invalid profile key transaction')
  const journal = value as Journal
  assertManagedId(journal.id)
  if (
    journal.version !== 1 ||
    typeof journal.config !== 'string' ||
    (journal.content !== null && typeof journal.content !== 'string')
  ) {
    throw new Error('Invalid profile key transaction')
  }
  assertManagedConfig(parseYaml(journal.config), 'profile')
  if (
    journal.runtime !== undefined &&
    (!journal.runtime ||
      typeof journal.runtime.perProfile !== 'boolean' ||
      typeof journal.runtime.content !== 'string')
  ) {
    throw new Error('Invalid subscription runtime recovery record')
  }
  return journal
}

function runtimePath(directory: string, id: string, perProfile: boolean): string {
  return join(directory, 'work', perProfile ? id : '', 'config.yaml')
}

async function restore(
  directory: string,
  journal: Journal,
  write = writeDurableText
): Promise<void> {
  if (journal.runtime)
    await write(
      runtimePath(directory, journal.id, journal.runtime.perProfile),
      journal.runtime.content
    )
  if (journal.content !== null)
    await write(join(directory, 'profiles', `${journal.id}.yaml`), journal.content)
  await write(join(directory, 'profile.yaml'), journal.config)
  await rm(join(directory, journalName), { force: true })
  await syncDirectory(directory)
}

async function recover(directory: string): Promise<void> {
  const path = join(directory, journalName)
  let bytes: string
  try {
    if ((await stat(path)).size > 512 * 1024 * 1024)
      throw new Error('Profile key transaction is too large')
    bytes = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  await restore(directory, validateJournal(JSON.parse(bytes)))
}

export function recoverProfileKeyTransaction(directory: string): Promise<void> {
  return enqueue(() => recover(directory))
}

export function writeProfileKeyTransaction(
  directory: string,
  id: string,
  oldConfig: string,
  oldContent: string | null,
  nextConfig: string,
  nextContent: string | null,
  write = writeDurableText,
  runtime?: SubscriptionRuntimeFile
): Promise<void> {
  return enqueue(async () => {
    await recover(directory)
    const journal = validateJournal({ version: 1, id, config: oldConfig, content: oldContent })
    assertManagedConfig(parseYaml(nextConfig), 'profile')
    const target = runtime && runtimePath(directory, id, runtime.perProfile)
    if (target && runtime) {
      journal.runtime = { perProfile: runtime.perProfile, content: await readFile(target, 'utf8') }
    }
    const path = join(directory, journalName)
    // The rollback record is durable before either member of the pair changes.
    await writeDurableText(path, JSON.stringify(journal))
    try {
      if (nextContent !== null) await write(join(directory, 'profiles', `${id}.yaml`), nextContent)
      await write(join(directory, 'profile.yaml'), nextConfig)
      if (target && runtime) await write(target, runtime.content)
      await rm(path)
      await syncDirectory(directory)
    } catch (error) {
      try {
        await restore(directory, journal, write)
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Profile key update failed; recovery is required'
        )
      }
      throw error
    }
  })
}

export function readProfileKeySnapshot(
  directory: string,
  id: string
): Promise<{ item?: ProfileItem; content?: string }> {
  return enqueue(async () => {
    assertManagedId(id)
    await recover(directory)
    const config = parseYaml<ProfileConfig>(await readFile(join(directory, 'profile.yaml'), 'utf8'))
    assertManagedConfig(config, 'profile')
    let content: string | undefined
    try {
      content = await readFile(join(directory, 'profiles', `${id}.yaml`), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return { item: config.items.find((item) => item.id === id), content }
  })
}
