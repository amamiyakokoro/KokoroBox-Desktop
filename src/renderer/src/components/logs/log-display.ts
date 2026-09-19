import dayjs from 'dayjs'

export type LogTokenKind =
  'text' | 'protocol' | 'ip' | 'domain' | 'port' | 'process' | 'rule' | 'action' | 'keyword'

export interface LogToken {
  kind: LogTokenKind
  value: string
}

export interface ParsedLogMessage {
  primary: LogToken[]
  secondary?: LogToken[]
}

const protocolPattern =
  /^(?:\[(?:TCP|UDP|HTTP|HTTPS|SOCKS5|DNS)(?:\([^)]*\))?\]|(?:TCP|UDP|HTTP|HTTPS|SOCKS5|DNS)(?:\([^)]*\))?)$/i
const rulePattern =
  /^(?:RuleSet|GeoIP|GeoSite|DomainSuffix|DomainKeyword|Domain|IPCIDR|MATCH)\([^)]*\)$/i
const domainPattern = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z\d-]{2,63}$/i
const semanticTokenPattern =
  /(\[(?:TCP|UDP|HTTP|HTTPS|SOCKS5|DNS)(?:\([^)]*\))?\]|(?:TCP|UDP|HTTP|HTTPS|SOCKS5|DNS)(?:\([^)]*\))?|(?:RuleSet|GeoIP|GeoSite|DomainSuffix|DomainKeyword|Domain|IPCIDR|MATCH)\([^)]*\)|\b(?:DIRECT|REJECT(?:-DROP)?|PASS)\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z\d-]{2,63}\b|:\d{1,5}\b|\([^()\s]+\)|\bmatch\b)/gi

function tokenKind(value: string): LogTokenKind {
  if (protocolPattern.test(value)) return 'protocol'
  if (rulePattern.test(value)) return 'rule'
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return 'ip'
  if (/^:\d{1,5}$/.test(value)) return 'port'
  if (/^\([^()\s]+\)$/.test(value)) return 'process'
  if (/^(?:DIRECT|REJECT(?:-DROP)?|PASS)$/i.test(value)) return 'action'
  if (/^match$/i.test(value)) return 'keyword'
  if (domainPattern.test(value)) return 'domain'
  return 'text'
}

function tokenizeLogText(value: string): LogToken[] {
  const tokens: LogToken[] = []
  let cursor = 0

  for (const match of value.matchAll(semanticTokenPattern)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ kind: 'text', value: value.slice(cursor, index) })
    tokens.push({ kind: tokenKind(match[0]), value: match[0] })
    cursor = index + match[0].length
  }

  if (cursor < value.length) tokens.push({ kind: 'text', value: value.slice(cursor) })
  return tokens
}

function tokenizeLogDetails(value: string): LogToken[] {
  const routeMarker = /\b(?:using|proxy chain)\b/i.exec(value)
  if (!routeMarker || routeMarker.index === undefined) return tokenizeLogText(value)

  const markerEnd = routeMarker.index + routeMarker[0].length
  const routeValue = value.slice(markerEnd)
  const leadingSpace = routeValue.match(/^\s*/)?.[0] ?? ''
  const target = routeValue.slice(leadingSpace.length)

  return [
    ...tokenizeLogText(value.slice(0, routeMarker.index)),
    { kind: 'keyword', value: routeMarker[0] },
    ...(leadingSpace ? [{ kind: 'text' as const, value: leadingSpace }] : []),
    ...(target ? [{ kind: 'action' as const, value: target }] : [])
  ]
}

export function parseLogMessage(value: string): ParsedLogMessage {
  const detailMarker = /\s+(?=(?:match|using|proxy chain)\b)/i.exec(value)
  if (!detailMarker || detailMarker.index === undefined) {
    return { primary: tokenizeLogText(value) }
  }

  return {
    primary: tokenizeLogText(value.slice(0, detailMarker.index).trimEnd()),
    secondary: tokenizeLogDetails(value.slice(detailMarker.index).trim())
  }
}

export function formatLogTimestamp(value?: string, reference: Date = new Date()): string {
  if (!value) return ''

  const timestamp = dayjs(value)
  if (!timestamp.isValid()) return value

  return timestamp.isSame(dayjs(reference), 'day')
    ? timestamp.format('HH:mm:ss')
    : timestamp.format('YYYY-MM-DD HH:mm:ss')
}
