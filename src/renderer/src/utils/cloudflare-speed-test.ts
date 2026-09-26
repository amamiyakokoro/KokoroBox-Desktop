export interface SpeedTestResult {
  download?: number
  upload?: number
  latency?: number
  jitter?: number
}
export type SpeedTestPhase = 'latency' | 'download' | 'upload'

interface TestOptions {
  signal: AbortSignal
  onProgress: (result: SpeedTestResult, phase: SpeedTestPhase) => void
  fetch?: typeof fetch
  now?: () => number
  phaseDurationMs?: number
  phaseBytes?: number
}

const MAX_PHASE_BYTES = 32_000_000
const REQUEST_TIMEOUT_MS = 15_000

/** Use elapsed request time: file:// renderers redact Resource Timing's requestStart/responseStart. */
export async function runCloudflareSpeedTest(options: TestOptions): Promise<SpeedTestResult> {
  const request = options.fetch || globalThis.fetch
  const now = options.now || (() => performance.now())
  const result: SpeedTestResult = {}
  const measure = async (phase: SpeedTestPhase, bytes: number): Promise<number> => {
    options.signal.throwIfAborted()
    const controller = new AbortController()
    const cancel = () => controller.abort(options.signal.reason)
    options.signal.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(
      () => controller.abort(new Error('Measurement timed out')),
      REQUEST_TIMEOUT_MS
    )
    try {
      const upload = phase === 'upload'
      const url = new URL(
        upload ? 'https://speed.cloudflare.com/__up' : 'https://speed.cloudflare.com/__down'
      )
      url.searchParams.set('bytes', String(bytes))
      url.searchParams.set('measId', crypto.randomUUID())
      const start = now()
      const response = await request(url.href, {
        method: upload ? 'POST' : 'GET',
        body: upload ? new Uint8Array(bytes) : undefined,
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      })
      if (!response.ok) throw new Error(`Cloudflare HTTP ${response.status}`)
      const body = await response.arrayBuffer()
      const duration = now() - start
      options.signal.throwIfAborted()
      // Cloudflare's zero-byte latency response includes a small identifier.
      if (phase === 'download' && body.byteLength !== bytes)
        throw new Error('Incomplete download measurement')
      if (response.headers.get('content-type')?.includes('text/html'))
        throw new Error('Invalid measurement response')
      if (upload) {
        const received = response.headers.get('cf-meta-upload-bytes')
        if (received !== null && Number(received) !== bytes)
          throw new Error('Incomplete upload measurement')
      }
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid measurement timing')
      return duration
    } finally {
      clearTimeout(timer)
      options.signal.removeEventListener('abort', cancel)
      controller.abort()
    }
  }

  options.onProgress({ ...result }, 'latency')
  await measure('latency', 0) // Warm up DNS/TLS before taking latency samples.
  const latencies: number[] = []
  for (let index = 0; index < 5; index++) {
    latencies.push(await measure('latency', 0))
    const sorted = [...latencies].sort((a, b) => a - b)
    result.latency = sorted[Math.floor(sorted.length / 2)]
    if (latencies.length > 1)
      result.jitter =
        latencies.slice(1).reduce((sum, value, i) => sum + Math.abs(value - latencies[i]), 0) /
        (latencies.length - 1)
    options.onProgress({ ...result }, 'latency')
  }
  for (const phase of ['download', 'upload'] as const) {
    options.onProgress({ ...result }, phase)
    const budget = options.phaseBytes ?? MAX_PHASE_BYTES
    let transferred = 0
    let elapsed = 0
    let bytes = Math.min(100_000, budget)
    while (transferred < budget && elapsed < (options.phaseDurationMs ?? 5_000)) {
      const duration = await measure(phase, bytes)
      transferred += bytes
      elapsed += duration
      result[phase] = (transferred * 8_000) / elapsed
      options.onProgress({ ...result }, phase)
      // Target roughly half-second samples, bounded by the remaining data budget.
      bytes = Math.min(
        budget - transferred,
        8_000_000,
        Math.max(100_000, Math.round((bytes * 500) / duration))
      )
    }
  }
  return result
}
