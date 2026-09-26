import { parse } from 'tldts'

export type LogRuleType = 'DOMAIN-SUFFIX' | 'DOMAIN' | 'PROCESS-NAME'

export interface LogActionDetails {
  process?: string
  destination?: string
  domain?: string
}

export function logRulePayload(details: LogActionDetails, type: LogRuleType): string {
  if (type === 'PROCESS-NAME') return details.process || ''
  const domain = details.domain ? logDomain(details.domain) : undefined
  if (!domain) return ''
  if (type === 'DOMAIN') return domain
  const parsed = parse(domain, { allowPrivateDomains: true })
  // Keep unknown/internal suffixes intact; never guess a broader network scope.
  if (!parsed.isIcann && !parsed.isPrivate) return domain
  return parsed.domain || ''
}

export function logDomain(value: string): string | undefined {
  const domain = value.toLowerCase().replace(/\.$/, '')
  if (domain.length > 253 || /^\d+(?:\.\d+){3}$/.test(domain)) return undefined
  return /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(domain)
    ? domain
    : undefined
}

// Read the connection endpoints, never rule/provider names or error details.
export function getLogActionDetails(payload: string): LogActionDetails {
  const connection =
    /\b(?:\d{1,3}\.){3}\d{1,3}:\d+(?:\((.*?)\))?\s+-->\s+(\S+)|\[[\da-f:]+\]:\d+(?:\((.*?)\))?\s+-->\s+(\S+)/i.exec(
      payload
    )
  if (!connection) return {}
  const process = (connection[1] || connection[3])?.trim()
  const destination = connection[2] || connection[4]
  const host = destination.replace(/:\d+$/, '')
  return { process: process || undefined, destination, domain: logDomain(host) }
}

export function fullLogText(log: { time?: string; type: string; payload: string }): string {
  return `${log.time ? `${log.time} ` : ''}[${log.type.toUpperCase()}] ${log.payload}`
}

export function prependLogRule(
  rules: KokoroCustomRuleInput[],
  rule: KokoroCustomRuleInput
): KokoroCustomRuleInput[] {
  if (
    rules.some(
      (item) =>
        item.type === rule.type && item.payload === rule.payload && item.target === rule.target
    )
  ) {
    return rules
  }
  return [rule, ...rules]
}
