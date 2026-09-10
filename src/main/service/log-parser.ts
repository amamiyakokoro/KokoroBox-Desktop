export interface ServiceLogEntry {
  msg?: string
  message?: string
  error?: string
  status?: {
    state?: string
    error?: string
  }
}

function parseEntry(value: string): ServiceLogEntry | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as ServiceLogEntry) : null
  } catch {
    return null
  }
}

/**
 * Extracts the last complete JSON object from service command output.
 *
 * The service uses pretty-printed JSON containing nested `status` objects, and
 * command wrappers may append plain text. Counting braces instead of stopping
 * at the first closing brace handles both cases as well as one-line JSON logs.
 */
export function parseServiceLog(output: string): ServiceLogEntry | null {
  let last: ServiceLogEntry | null = null
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < output.length; index++) {
    const character = output[index]

    if (start < 0) {
      if (character === '{') {
        start = index
        depth = 1
      }
      continue
    }

    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }

    if (character === '"') {
      inString = true
    } else if (character === '{') {
      depth++
    } else if (character === '}') {
      depth--
      if (depth === 0) {
        last = parseEntry(output.slice(start, index + 1)) ?? last
        start = -1
      }
    }
  }

  return last
}
