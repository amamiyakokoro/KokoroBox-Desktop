import type { Worker } from 'node:worker_threads'

export const OVERRIDE_TIMEOUT_MS = 15_000
export const OVERRIDE_LOG_LIMIT = 64 * 1024

export interface OverrideResult {
  profile?: MihomoConfig
  error?: string
  logs: string
}

/** The deadline covers startup, synchronous code, and asynchronous work alike. */
export async function executeOverride(
  createWorker: () => Worker,
  timeoutMs = OVERRIDE_TIMEOUT_MS
): Promise<OverrideResult> {
  const worker = createWorker()
  let logs = ''
  let truncated = false
  try {
    return await new Promise<OverrideResult>((resolve) => {
      let settled = false
      const finish = (result: Omit<OverrideResult, 'logs'>): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ ...result, logs })
      }
      const timer = setTimeout(
        () => finish({ error: `Script timed out after ${timeoutMs} ms` }),
        timeoutMs
      )
      worker.on('message', (message) => {
        if (message.type === 'log') {
          if (truncated) return
          const remaining = OVERRIDE_LOG_LIMIT - Buffer.byteLength(logs)
          const chunk = Buffer.from(String(message.text))
          logs += chunk.subarray(0, Math.max(remaining, 0)).toString()
          if (chunk.length >= remaining) {
            truncated = true
            logs += '\n[info] Script log limit reached\n'
          }
        } else if (message.type === 'result') {
          finish({ profile: message.profile, error: message.error })
        }
      })
      worker.once('error', (error) =>
        finish({ error: error instanceof Error ? error.message : String(error) })
      )
      worker.once('exit', (code) =>
        finish({ error: `Script worker exited before returning a result (${code})` })
      )
    })
  } finally {
    // Wait for actual termination before another override can run.
    await worker.terminate()
  }
}
