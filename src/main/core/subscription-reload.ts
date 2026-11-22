import { isDeepStrictEqual } from 'node:util'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'

export class ReloadRejected extends Error {}

// Mihomo accepts these scalar changes without rebuilding providers or connections.
export function selectRuntimePatch(
  previous: MihomoConfig | undefined,
  next: MihomoConfig,
  requested: Partial<MihomoConfig> = {}
): Partial<Pick<MihomoConfig, 'mode' | 'log-level'>> | undefined {
  if (!previous) return
  const keys = new Set([...Object.keys(previous), ...Object.keys(next), ...Object.keys(requested)])
  const patch: Partial<Pick<MihomoConfig, 'mode' | 'log-level'>> = {}
  for (const key of keys) {
    if (!Object.hasOwn(requested, key) && isDeepStrictEqual(previous[key], next[key])) continue
    if (key === 'mode') patch.mode = next.mode ?? 'rule'
    else if (key === 'log-level') patch['log-level'] = next['log-level'] ?? 'info'
    else return
  }
  return Object.keys(patch).length ? patch : undefined
}

export async function withRuntimeCandidate<T>(
  configPath: string,
  yaml: string,
  operation: (path: string) => Promise<T>
): Promise<T> {
  const candidate = `${configPath}.${randomUUID()}.yaml`
  try {
    await writeFile(candidate, yaml, { flag: 'wx', mode: 0o600 })
    return await operation(candidate)
  } finally {
    await rm(candidate, { force: true }).catch(() => {})
  }
}

/** The published file stays readable by the core until the subscription transaction commits. */
export async function applySubscriptionRuntime(
  configPath: string,
  yaml: string,
  validate: (path: string) => Promise<void>,
  reload: (path: string) => Promise<void>,
  commit: () => Promise<void>,
  rollback: () => Promise<void> = () => reload(configPath)
): Promise<void> {
  await withRuntimeCandidate(configPath, yaml, async (candidate) => {
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
  })

  async function restore(error: unknown): Promise<never> {
    try {
      await rollback()
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Subscription update failed (${error}). Could not confirm the previous configuration (${rollbackError}).`
      )
    }
    throw error
  }
}
