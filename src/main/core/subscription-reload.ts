import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'

export class ReloadRejected extends Error {}

/** The published file stays readable by the core until the subscription transaction commits. */
export async function applySubscriptionRuntime(
  configPath: string,
  yaml: string,
  validate: (path: string) => Promise<void>,
  reload: (path: string) => Promise<void>,
  commit: () => Promise<void>
): Promise<void> {
  const candidate = `${configPath}.${randomUUID()}.yaml`
  try {
    await writeFile(candidate, yaml, { flag: 'wx', mode: 0o600 })
    await validate(candidate)
    try {
      await reload(candidate)
    } catch (error) {
      if (error instanceof ReloadRejected) throw error
      // A lost response can arrive after the core has applied the new rules.
      await restore(error)
    }
    try {
      await commit()
    } catch (error) {
      await restore(error)
    }
  } finally {
    await rm(candidate, { force: true }).catch(() => {})
  }

  async function restore(error: unknown): Promise<never> {
    try {
      await reload(configPath)
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Subscription update failed (${error}). Could not confirm the previous configuration (${rollbackError}).`
      )
    }
    throw error
  }
}
