/** Older services have no routing level; preserve their info display. */
export function diagnosticLogLevel(level: unknown): LogLevel {
  const value = String(level ?? 'info').toLowerCase()
  if (['error', 'fatal', 'panic', 'dpanic'].includes(value)) return 'error'
  if (value === 'warn' || value === 'warning') return 'warning'
  return value === 'debug' ? 'debug' : 'info'
}

const levelOrder: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warning: 2,
  info: 3,
  debug: 4
}

export function isDiagnosticLogVisible(level: LogLevel, threshold: LogLevel): boolean {
  return threshold !== 'silent' && levelOrder[level] <= levelOrder[threshold]
}

/** Formats Native library and sidecar records for the application's log file. */
export function nativeLogLine(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const entry = value as Record<string, unknown>
  if (typeof entry.msg !== 'string' || !entry.msg.trim()) return undefined
  const time = typeof entry.ts === 'string' ? Date.parse(entry.ts) : entry.timestamp
  const ts =
    typeof time === 'number' && Number.isFinite(time) && Math.abs(time) <= 8.64e15
      ? new Date(time).toISOString()
      : new Date().toISOString()
  return (
    JSON.stringify({
      ts,
      level: diagnosticLogLevel(entry.level),
      source: 'kokorobox-native',
      target: typeof entry.target === 'string' ? entry.target.slice(0, 100) : 'native',
      msg: boundedNativeMessage(entry.msg)
    }) + '\n'
  )
}

function boundedNativeMessage(message: string): string {
  let end = Math.min(message.length, 4096)
  if (end < message.length && /[\uD800-\uDBFF]/.test(message[end - 1])) end--
  return message.slice(0, end)
}

/** stderr chunks can contain partial records or several lines. */
export function createNativeSidecarLogReader(write: (line: string) => void, target: string) {
  let buffer = ''
  let truncated = false
  const flush = (): void => {
    const line = buffer.trim()
    buffer = ''
    const wasTruncated = truncated
    truncated = false
    if (!line) return
    let entry: unknown
    try {
      entry = wasTruncated ? undefined : JSON.parse(line)
    } catch {
      /* Legacy stderr. */
    }
    if (!entry)
      entry = {
        level: wasTruncated ? 'warn' : 'error',
        target,
        msg: wasTruncated ? 'Native diagnostic truncated: ' + line : line
      }
    const formatted = nativeLogLine(entry)
    if (formatted) write(formatted)
  }
  return {
    push(chunk: string): void {
      const parts = chunk.split('\n')
      parts.forEach((part, index) => {
        if (buffer.length + part.length > 16 * 1024) truncated = true
        buffer = (buffer + part).slice(0, 16 * 1024)
        if (index < parts.length - 1) flush()
      })
    },
    flush
  }
}
