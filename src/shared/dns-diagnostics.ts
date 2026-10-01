import { tr } from './i18n'
import type {
  NativeSystemDNSDiagnostics,
  DNSResolutionDiagnostics
} from './proxy-diagnostics-contract'
import type { DiagnosticResult, SystemProxyDiagnostics } from './system-proxy-diagnostics'

export interface DNSEvidence {
  system?: NativeSystemDNSDiagnostics
  core?: DNSResolutionDiagnostics
  bootstrap: string[]
  replacement?: string[]
  bootstrapMatchesSystem?: boolean
  configurable?: boolean
}

export function canRepairDNS(evidence: DNSEvidence): boolean {
  const { system, core, bootstrap } = evidence
  return (
    (system?.outcome === 'failed' || core?.outcome === 'failed') &&
    evidence.configurable !== false &&
    !!system?.interface &&
    (evidence.replacement ?? system.servers).length > 0 &&
    !(
      evidence.bootstrapMatchesSystem ??
      (bootstrap.length === system.servers.length &&
        bootstrap.every((ip) => system.servers.includes(ip)))
    )
  )
}

export function appendDNSDiagnostics(
  result: SystemProxyDiagnostics,
  evidence: DNSEvidence
): SystemProxyDiagnostics {
  const { system, core, bootstrap } = evidence
  const row = (id: string, title: string, value?: DNSResolutionDiagnostics): DiagnosticResult => ({
    id,
    title: tr(title),
    status:
      value?.outcome === 'success' ? 'success' : value?.outcome === 'failed' ? 'error' : 'info',
    summary: tr(
      value?.outcome === 'success'
        ? 'DNS resolution successful'
        : value?.outcome === 'failed'
          ? 'DNS resolution failed'
          : 'DNS resolution could not be checked'
    ),
    details: value?.queries
      .map(
        (q) =>
          `${q.domain}: ${tr(q.outcome === 'success' ? 'Success' : q.outcome === 'failed' ? 'DNS resolution failed' : 'Not checked')}`
      )
      .join('\n')
  })
  const rows = [
    row('core-dns', 'Core DNS resolution', core),
    row('system-dns', 'System DNS resolution', system)
  ]
  const failed = system?.outcome === 'failed' || core?.outcome === 'failed'
  if (failed) {
    const repairable = canRepairDNS(evidence)
    rows.push({
      id: 'dns-settings',
      title: tr('Current network DNS'),
      status: 'warning',
      summary: tr(
        repairable
          ? 'Try replacing bootstrap DNS with the current system DNS'
          : 'Inspect DNS and upstream resolver settings'
      ),
      details: [
        tr('Network interface: {0}', [
          system?.interface
            ?.split('')
            .filter((character) => character.charCodeAt(0) >= 32)
            .join('')
            .slice(0, 80) || tr('Unknown')
        ]),
        tr('Current DNS: {0}', [system?.servers.join(', ') || tr('Unknown')]),
        tr('Bootstrap DNS: {0}', [bootstrap.join(', ') || tr('Not configured')]),
        tr(
          'This saves the current system DNS addresses as KokoroBox bootstrap DNS and restarts the core. Upstream resolver or proxy failures may still require a different fix.'
        ),
        ...(evidence.configurable === false
          ? [
              tr(
                'Enable DNS settings control in KokoroBox or update bootstrap DNS in your profile, then run diagnostics again.'
              )
            ]
          : []),
        ...(!(evidence.replacement ?? system?.servers)?.length
          ? [
              tr(
                'No usable system DNS addresses could be read. Configure bootstrap DNS in KokoroBox DNS settings, then run diagnostics again.'
              )
            ]
          : [])
      ].join('\n'),
      action: repairable ? 'restore-bootstrap-dns' : undefined,
      actionHint: repairable ? tr('Saves bootstrap DNS and restarts the core.') : undefined
    })
  }
  const overall =
    failed && ['healthy', 'warning', 'connectivity-failed'].includes(result.overall.kind)
      ? {
          kind: 'dns-failed' as const,
          status: 'error' as const,
          summary: tr('DNS resolution requires attention')
        }
      : result.overall
  const results = [...result.results, ...rows]
  return {
    ...result,
    overall,
    results,
    report: [
      'KokoroBox System Proxy Diagnostics',
      result.checkedAt,
      overall.summary,
      ...results.map(
        (check) =>
          `${check.title}: [${check.status}] ${check.summary}${check.details ? `\n${check.details}` : ''}`
      )
    ].join('\n\n')
  }
}
