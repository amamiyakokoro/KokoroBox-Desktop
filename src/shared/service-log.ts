import { diagnosticLogLevel } from './diagnostic-log'

export interface ServiceLogSnapshot {
  session: string
  offset: number
  end: number
  content: string
}

export interface ServiceLogEntry {
  id: string
  offset: number
  type: LogLevel
  time?: string
  payload: string
  message?: string
  fields?: Record<string, unknown>
}

export interface ServiceLogCursor {
  session: string
  end: number
}

function jsonEnd(content: string, start: number): number | undefined {
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < content.length; index++) {
    const char = content[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return index + 1
  }
  return undefined
}

function normalizeEntry(
  raw: string
): Pick<ServiceLogEntry, 'type' | 'time' | 'payload' | 'message' | 'fields'> {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    const type = diagnosticLogLevel(value.level)
    const message = String(value.msg ?? value.message ?? '')
    const fields = Object.fromEntries(
      Object.entries(value).filter(([key]) => !['ts', 'level', 'msg', 'message'].includes(key))
    )
    const details = Object.entries(fields)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' · ')
    return {
      type,
      time: typeof value.ts === 'string' ? value.ts : undefined,
      message,
      fields,
      payload: [message, details].filter(Boolean).join('\n') || raw
    }
  } catch {
    return { type: /^panic:|^fatal error:/i.test(raw) ? 'error' : 'info', payload: raw }
  }
}

/** Parses complete pretty JSON entries and stderr lines, retaining structured fields. */
export function parseServiceLogs(
  snapshot: ServiceLogSnapshot,
  cleared?: ServiceLogCursor
): ServiceLogEntry[] {
  const entries: ServiceLogEntry[] = []
  const encoder = new TextEncoder()
  const { content } = snapshot
  let index = 0
  let offset = snapshot.offset
  let partialHead = snapshot.offset > 0
  while (index < content.length) {
    const lineEnd = content.indexOf('\n', index)
    if (lineEnd < 0 && content[index] !== '{') break
    const line = content.slice(index, lineEnd < 0 ? content.length : lineEnd).trim()
    let end = lineEnd + 1
    let raw = line
    if (content[index] === '{') {
      const objectEnd = jsonEnd(content, index)
      if (objectEnd === undefined) break // A concurrent write may be incomplete.
      end = objectEnd
      raw = content.slice(index, end)
      partialHead = false
    } else if (partialHead || !line) {
      // A bounded tail can start inside a UTF-8 character or a JSON record.
      if (line === '}' && content[index] === '}') partialHead = false
      raw = ''
    }
    if (raw && !(cleared?.session === snapshot.session && offset < cleared.end)) {
      entries.push({ id: `${snapshot.session}:${offset}`, offset, ...normalizeEntry(raw) })
    }
    offset += encoder.encode(content.slice(index, end)).length
    index = end
  }
  return entries
}

export function validateServiceLogSnapshot(value: unknown): ServiceLogSnapshot {
  const snapshot = value as ServiceLogSnapshot | undefined
  if (
    !snapshot ||
    typeof snapshot.session !== 'string' ||
    !snapshot.session ||
    typeof snapshot.content !== 'string' ||
    !Number.isSafeInteger(snapshot.offset) ||
    !Number.isSafeInteger(snapshot.end) ||
    snapshot.offset < 0 ||
    snapshot.end < snapshot.offset ||
    snapshot.end - snapshot.offset > 512 * 1024 ||
    snapshot.content.length > 512 * 1024
  ) {
    throw new Error('Invalid Service log snapshot')
  }
  return snapshot
}
