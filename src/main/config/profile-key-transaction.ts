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

interface Journal {
  version: 1
  id: string
  config: string
  content: string
}
function validateJournal(value: unknown): Journal {
  if (!value || typeof value !== 'object') throw new Error('Invalid profile key transaction')
  const journal = value as Journal
  assertManagedId(journal.id)
  if (
    journal.version !== 1 ||
    typeof journal.config !== 'string' ||
    typeof journal.content !== 'string'
  ) {
    throw new Error('Invalid profile key transaction')
  }
  assertManagedConfig(parseYaml(journal.config), 'profile')
  return journal
}

async function restore(
  directory: string,
  journal: Journal,
  write = writeDurableText
): Promise<void> {
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
  oldContent: string,
  nextConfig: string,
  nextContent: string,
  write = writeDurableText
): Promise<void> {
  return enqueue(async () => {
    await recover(directory)
    const journal = validateJournal({ version: 1, id, config: oldConfig, content: oldContent })
    assertManagedConfig(parseYaml(nextConfig), 'profile')
    const path = join(directory, journalName)
    // The rollback record is durable before either member of the pair changes.
    await writeDurableText(path, JSON.stringify(journal))
    try {
      await write(join(directory, 'profiles', `${id}.yaml`), nextContent)
      await write(join(directory, 'profile.yaml'), nextConfig)
      await rm(path)
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
    await syncDirectory(directory)
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
