export type ProcessRouterEventName = 'ready' | 'rules_replaced' | 'running' | 'stopped' | 'error'

export interface ProcessRouterEvent {
  version: 1
  event: ProcessRouterEventName
  message?: string
}

const eventNames = new Set<ProcessRouterEventName>([
  'ready',
  'rules_replaced',
  'running',
  'stopped',
  'error'
])

export function parseProcessRouterEvent(line: string): ProcessRouterEvent {
  const value = JSON.parse(line) as Partial<ProcessRouterEvent>
  if (
    !value ||
    value.version !== 1 ||
    typeof value.event !== 'string' ||
    !eventNames.has(value.event as ProcessRouterEventName) ||
    (value.message !== undefined &&
      (typeof value.message !== 'string' || value.message.length > 512))
  ) {
    throw new Error('Unsupported process router protocol')
  }
  return value as ProcessRouterEvent
}
