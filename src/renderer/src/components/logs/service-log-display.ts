export function serviceLogValue(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
}

export function serviceLogDuration(fields: Record<string, unknown>): string | undefined {
  const ms = fields.duration_ms
  if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) {
    if (ms >= 1000) return `${Number((ms / 1000).toFixed(2))} s`
    return `${Number(ms.toPrecision(3))} ms`
  }
  return typeof fields.duration === 'string' ? fields.duration : undefined
}

export function serviceHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined
}

const importantFields = [
  'error',
  'reason',
  'state',
  'status',
  'action',
  'operation',
  'process',
  'pid',
  'host',
  'port',
  'proxy',
  'rule'
]

export function serviceLogSummary(fields: Record<string, unknown>): {
  request?: { method: string; path: string }
  status?: number
  duration?: string
  important: [string, unknown][]
  details: [string, unknown][]
} {
  const path = fields.path ?? fields.route
  const request =
    typeof fields.method === 'string' && typeof path === 'string'
      ? { method: fields.method, path }
      : undefined
  const status = serviceHttpStatus(fields.status)
  const duration = serviceLogDuration(fields)
  const extracted = new Set<string>()
  if (request) {
    extracted.add('method')
    extracted.add(typeof fields.path === 'string' ? 'path' : 'route')
    if (fields.route === request.path) extracted.add('route')
  }
  if (status !== undefined) extracted.add('status')
  if (duration !== undefined) {
    extracted.add('duration')
    extracted.add('duration_ms')
  }
  const important: [string, unknown][] = importantFields
    .filter((key) => Object.hasOwn(fields, key) && !extracted.has(key))
    .map((key) => [key, fields[key]])
  important.forEach(([key]) => extracted.add(key))
  return {
    request,
    status,
    duration,
    important,
    details: Object.entries(fields).filter(([key]) => !extracted.has(key))
  }
}
