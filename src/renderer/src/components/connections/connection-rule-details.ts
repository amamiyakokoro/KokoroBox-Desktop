import { logDomain, type LogActionDetails } from '../logs/log-actions'

export function connectionRuleDetails(
  metadata: Pick<
    ControllerConnectionDetail['metadata'],
    'host' | 'sniffHost' | 'process' | 'processPath'
  >
): LogActionDetails {
  // Prefer actual host metadata; a sniffed domain can recover an IP-only target.
  const domain = logDomain(metadata.host || '') || logDomain(metadata.sniffHost || '')
  const process = metadata.process?.trim() || metadata.processPath?.split(/[\\/]/).pop()?.trim()
  return { domain, process: process || undefined }
}
