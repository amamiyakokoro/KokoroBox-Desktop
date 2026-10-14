import { isAppRoutingRuleEffectivelyEnabled } from './app-routing'
import { tr } from './i18n'
import type { ProxyRuntimeDiagnosticsFailure } from './proxy-diagnostics-contract'
import type { DiagnosticAction, SystemProxyDiagnostics } from './system-proxy-diagnostics'

export type RecoveryServiceState =
  'running' | 'stopped' | 'paused' | 'not-installed' | 'need-init' | 'requires-approval' | 'unknown'
export type RecoveryCoreState = 'running' | 'stopped' | 'not-ready' | 'unknown'
export interface RuntimeRecoverySnapshot {
  checkedAt: string
  platform: string
  service: RecoveryServiceState
  serviceRequired: boolean
  coreMode: 'service' | 'direct'
  core: RecoveryCoreState
  coreError?: string
  proxy: { required: boolean; port: number | null; available: boolean | null }
  readError?: ProxyRuntimeDiagnosticsFailure
  routing: { enabled: boolean; hasRules: boolean; requiresProxy: boolean; status: AppRoutingStatus }
}
export type RecoveryAction =
  | DiagnosticAction
  | 'check-again'
  | 'run-diagnostics'
  | 'open-extension-settings'
  | 'open-service-settings'
  | 'repair-service'
  | 'repair-firewall'
  | 'open-profiles'
  | 'open-routing'
  | 'open-core-settings'
  | 'view-logs'
  | 'restart-app'
  | 'open-app-settings'
export type RecoveryCause =
  | 'service-approval'
  | 'service-authentication'
  | 'service-unavailable'
  | 'restart-required'
  | 'extension-approval'
  | 'extension-missing'
  | 'core-configuration'
  | 'core-stopped'
  | 'core-not-ready'
  | 'routing-endpoint'
  | 'routing-firewall'
  | 'routing-unsupported'
  | 'routing-rules'
  | 'routing-unconfirmed'
  | 'runtime-unknown'
  | 'proxy-configuration'
  | 'dns'
  | 'connectivity'
export interface RecoveryIssue {
  cause: RecoveryCause
  title: string
  description: string
  actions: RecoveryAction[]
  actionHint?: string
}
export interface RecoveryLayer {
  id: string
  title: string
  state: 'success' | 'warning' | 'error' | 'info'
  label: string
}
export interface RuntimeRecoveryGuidance {
  layers: RecoveryLayer[]
  issue?: RecoveryIssue
  checkedAt?: string
}

export function applyRecoveryPreferences(
  snapshot: RuntimeRecoverySnapshot,
  config?: AppConfig,
  routingConfig?: AppRoutingConfig,
  status?: AppRoutingStatus
): RuntimeRecoverySnapshot {
  const rules = routingConfig?.rules.filter((rule) =>
    isAppRoutingRuleEffectivelyEnabled(routingConfig, rule)
  )
  const routing = {
    ...snapshot.routing,
    ...(routingConfig
      ? {
          enabled: routingConfig.enabled,
          hasRules: !!rules?.length,
          requiresProxy: !!rules?.some((rule) => rule.action === 'proxy')
        }
      : {}),
    status: status ?? snapshot.routing.status
  }
  const mode = config
    ? config.corePermissionMode === 'service'
      ? 'service'
      : 'direct'
    : snapshot.coreMode
  return {
    ...snapshot,
    routing,
    coreMode: mode,
    core: mode === snapshot.coreMode ? snapshot.core : 'unknown',
    coreError: mode === snapshot.coreMode ? snapshot.coreError : undefined,
    readError: mode === snapshot.coreMode ? snapshot.readError : undefined,
    proxy: {
      ...snapshot.proxy,
      ...(mode !== snapshot.coreMode ? { port: null, available: null } : {}),
      required: config ? config.sysProxy.enable : snapshot.proxy.required
    },
    serviceRequired: config
      ? mode === 'service' ||
        config.sysProxy.enable ||
        config.autoSetDNSMode === 'service' ||
        (snapshot.platform !== 'darwin' && routing.enabled && routing.hasRules)
      : snapshot.serviceRequired
  }
}

export function appRoutingRecoveryCause(status: AppRoutingStatus): RecoveryCause | undefined {
  if (!status.supported || status.state === 'unsupported') return 'routing-unsupported'
  if (status.needsUserApproval === true) return 'extension-approval'
  if (status.state === 'degraded') return 'routing-endpoint'
  const message = status.message || ''
  if (message === 'macOS application-routing system extension is not installed')
    return 'extension-missing'
  if (
    message.includes('Service 认证已失效') ||
    message.toLowerCase().includes('service is not initialized') ||
    message.includes('Service 尚未初始化')
  )
    return 'service-authentication'
  if (message.includes('防火墙') || message.includes('application-routing firewall'))
    return 'routing-firewall'
  if (message === '添加或启用规则以启动应用分流') return 'routing-rules'
  if (status.state === 'error' || status.state === 'disabled') return 'routing-unconfirmed'
  return undefined
}

export function buildRuntimeRecoveryGuidance(
  snapshot: RuntimeRecoverySnapshot,
  options: {
    diagnostics?: SystemProxyDiagnostics
    restartRequired?: boolean
    serviceRepairSupported?: boolean
  } = {}
): RuntimeRecoveryGuidance {
  const { diagnostics } = options
  const routing = snapshot.routing
  const cause = routing.enabled ? appRoutingRecoveryCause(routing.status) : undefined
  const authRequired =
    cause === 'service-authentication' ||
    (snapshot.serviceRequired &&
      (snapshot.readError === 'service-authentication-required' ||
        snapshot.service === 'need-init'))
  const core = snapshot.core
  const coreRequired =
    !routing.enabled ||
    routing.requiresProxy ||
    snapshot.serviceRequired ||
    diagnostics?.state.intentEnabled === true
  const configFailed = ['core-config-failed', 'core-start-failed', 'core-restart-failed'].includes(
    snapshot.coreError || ''
  )
  const endpointRequired = routing.enabled && routing.requiresProxy
  const routingRunning = ['running', 'degraded'].includes(routing.status.state)
  const layers: RecoveryLayer[] = [
    {
      id: 'service',
      title: tr('KokoroBox Service'),
      state: authRequired
        ? 'warning'
        : snapshot.service === 'running'
          ? 'success'
          : snapshot.serviceRequired
            ? 'warning'
            : 'info',
      label: authRequired
        ? tr('Authentication required')
        : snapshot.service === 'running'
          ? tr('Running')
          : !snapshot.serviceRequired
            ? tr('Not required for this configuration')
            : snapshot.service === 'requires-approval'
              ? tr('Approval required')
              : snapshot.service === 'unknown'
                ? tr('Unknown')
                : snapshot.service === 'not-installed'
                  ? tr('Not installed')
                  : tr('Stopped')
    },
    {
      id: 'core',
      title: tr('Mihomo core'),
      state: configFailed
        ? 'warning'
        : core === 'running'
          ? 'success'
          : core === 'unknown' || !coreRequired
            ? 'info'
            : 'warning',
      label: configFailed
        ? tr('Settings not applied')
        : core === 'running'
          ? tr('Running')
          : core === 'stopped'
            ? tr('Stopped')
            : core === 'not-ready'
              ? tr('Not ready')
              : tr('Unknown')
    },
    {
      id: 'proxy-listener',
      title: tr('Core proxy listener'),
      state: !snapshot.proxy.required
        ? 'info'
        : snapshot.proxy.available === true
          ? 'success'
          : snapshot.proxy.available === false
            ? 'warning'
            : 'info',
      label: !snapshot.proxy.required
        ? tr('Not required for this configuration')
        : snapshot.proxy.available === true
          ? tr('Available')
          : snapshot.proxy.port === null && snapshot.proxy.available === false
            ? tr('Not configured')
            : snapshot.proxy.available === false
              ? tr('Unavailable')
              : tr('Unknown')
    },
    {
      id: 'routing',
      title:
        snapshot.platform === 'darwin' ? tr('macOS Network Extension') : tr('Application routing'),
      state: !routing.enabled
        ? 'info'
        : cause === 'extension-approval'
          ? 'warning'
          : routingRunning
            ? 'success'
            : routing.status.state === 'error' || !routing.status.supported
              ? 'error'
              : 'info',
      label: !routing.enabled
        ? tr('Disabled')
        : cause === 'extension-approval'
          ? tr('Approval required')
          : cause === 'routing-unsupported'
            ? tr('Unsupported')
            : cause === 'extension-missing'
              ? tr('Not installed')
              : routingRunning
                ? tr('Running')
                : routing.status.state === 'starting'
                  ? tr('Starting')
                  : tr('Unconfirmed')
    },
    {
      id: 'routing-endpoint',
      title: tr('Application-routing proxy endpoint'),
      state: !endpointRequired
        ? 'info'
        : routing.status.state === 'running' && routing.status.mihomoAvailable
          ? 'success'
          : cause === 'routing-endpoint'
            ? 'warning'
            : 'info',
      label: !endpointRequired
        ? tr('Not required for this configuration')
        : routing.status.state === 'running' && routing.status.mihomoAvailable
          ? tr('Available')
          : cause === 'routing-endpoint'
            ? tr('Unavailable')
            : tr('Unknown')
    }
  ]
  const issue = (
    cause: RecoveryCause,
    title: string,
    description: string,
    actions: RecoveryAction[]
  ): RecoveryIssue => ({ cause, title: tr(title), description: tr(description), actions })
  let next: RecoveryIssue | undefined
  if (options.restartRequired)
    next = issue(
      'restart-required',
      'Restart KokoroBox to finish service repair',
      'The service repair is saved. Restart KokoroBox, then check the status again.',
      ['restart-app']
    )
  else if (snapshot.serviceRequired && snapshot.service === 'requires-approval')
    next = issue(
      'service-approval',
      'KokoroBox Service requires approval.',
      'Allow the background service in macOS settings. Network Extension approval is a separate setting.',
      ['open-service-settings', 'check-again']
    )
  else if (authRequired)
    next = issue(
      'service-authentication',
      'Service authentication needs repair',
      'The service may be running, but KokoroBox cannot authenticate. Repair its authentication before restarting the core.',
      ['repair-service', 'open-service-settings']
    )
  else if (snapshot.serviceRequired && !['running', 'unknown'].includes(snapshot.service))
    next = issue(
      'service-unavailable',
      'KokoroBox Service is unavailable.',
      'Install or repair the service, then check the status again.',
      ['repair-service', 'open-service-settings']
    )
  else if (cause === 'extension-approval')
    next = issue(
      cause,
      'Network Extension approval required',
      'macOS needs your approval before application routing can start.',
      ['open-extension-settings', 'check-again']
    )
  else if (cause === 'extension-missing')
    next = issue(
      cause,
      'The macOS system extension is not installed',
      'Repair or reinstall KokoroBox. Opening approval settings cannot restore a missing extension.',
      ['open-app-settings', 'view-logs']
    )
  else if (cause === 'routing-unsupported')
    next = issue(
      cause,
      'Application routing is unsupported',
      'This platform cannot run application routing. Review the platform requirements before enabling it.',
      ['open-routing', 'open-app-settings']
    )
  else if (configFailed)
    next = issue(
      'core-configuration',
      'Core settings could not be applied',
      'Core configuration could not be confirmed. Review the active subscription, overrides and core logs before retrying.',
      ['open-profiles', 'view-logs', 'check-again']
    )
  else if (coreRequired && core === 'stopped')
    next = issue(
      'core-stopped',
      'Mihomo core is stopped',
      'Start the core, then check whether the configured proxy features are available.',
      ['start-core', 'check-again']
    )
  else if (coreRequired && core === 'not-ready')
    next = issue(
      'core-not-ready',
      'Mihomo core is not ready',
      'The core is running, but its controller is not ready. Inspect the core settings and logs before retrying.',
      ['open-core-settings', 'view-logs', 'check-again']
    )
  else if (
    (coreRequired && core === 'unknown') ||
    (snapshot.serviceRequired && snapshot.service === 'unknown')
  )
    next = issue(
      'runtime-unknown',
      'Runtime status could not be confirmed',
      'Unavailable status is not proof that the core is stopped. Run diagnostics or inspect the logs before changing settings.',
      ['run-diagnostics', 'check-again', 'view-logs']
    )
  else if (cause === 'routing-endpoint' && endpointRequired)
    next = issue(
      cause,
      'Application-routing proxy endpoint unavailable',
      'The routing module is active, but its proxy endpoint is unavailable. Proxy traffic remains safely blocked. Start or restart the core, then check again.',
      ['restart-core', 'check-again', 'run-diagnostics']
    )
  else if (
    snapshot.proxy.required &&
    snapshot.proxy.available === false &&
    snapshot.proxy.port === null
  )
    next = issue(
      'proxy-configuration',
      'Core proxy listener is not configured',
      'Enable a local HTTP or mixed proxy listener in core settings, then check again.',
      ['open-core-settings', 'check-again']
    )
  else if (snapshot.proxy.required && snapshot.proxy.available === false)
    next = issue(
      'routing-endpoint',
      'Core proxy listener unavailable',
      'The core is running, but its configured proxy listener is unavailable. Inspect the listener settings and restart the core.',
      ['restart-core', 'open-core-settings']
    )
  else if (cause === 'routing-firewall')
    next = issue(
      cause,
      'Application-routing firewall needs repair',
      'The routing firewall could not be confirmed. Repair it before retrying application routing.',
      snapshot.platform === 'win32'
        ? ['repair-firewall', 'check-again']
        : ['view-logs', 'check-again']
    )
  else if (routing.enabled && !routing.hasRules)
    next = issue(
      'routing-rules',
      'Add or enable a rule to start application routing',
      'Application routing is enabled, but no active application rules are configured.',
      ['open-routing']
    )
  else if (cause === 'routing-unconfirmed')
    next = issue(
      cause,
      'Application-routing settings could not be confirmed',
      'Check the routing rules and logs, then retry. This status does not establish that macOS approval is missing.',
      ['check-again', 'view-logs']
    )
  else if (
    diagnostics &&
    snapshot.proxy.required &&
    ['configuration-mismatch', 'disabled'].includes(diagnostics.overall.kind) &&
    diagnostics.state.intentEnabled
  )
    next = {
      cause: 'proxy-configuration',
      title: diagnostics.overall.summary,
      description: tr('Restore the configured proxy settings, then run diagnostics again.'),
      actions: ['restore-system-proxy', 'run-diagnostics']
    }
  else if (diagnostics?.overall.kind === 'dns-failed') {
    const repairable = diagnostics.results.some((row) => row.action === 'restore-bootstrap-dns')
    next = issue(
      'dns',
      'DNS resolution needs attention',
      'Inspect the DNS diagnostic results. Repair is offered only when current system DNS is suitable.',
      repairable ? ['restore-bootstrap-dns', 'run-diagnostics'] : ['run-diagnostics', 'view-logs']
    )
  } else if (diagnostics?.overall.kind === 'listener-unavailable')
    next = issue(
      'routing-endpoint',
      'Core proxy listener unavailable',
      'The core is running, but its configured proxy listener is unavailable. Inspect the listener settings and restart the core.',
      ['restart-core', 'open-core-settings']
    )
  else if (diagnostics?.overall.kind === 'connectivity-failed')
    next = issue(
      'connectivity',
      'Proxy connectivity needs attention',
      'The local proxy is available, but the outbound connectivity check failed. Inspect the selected proxy and core logs.',
      ['run-diagnostics', 'view-logs']
    )
  else if (diagnostics?.overall.kind === 'runtime-unavailable')
    next = issue(
      'runtime-unknown',
      'Runtime status could not be confirmed',
      'Unavailable status is not proof that the core is stopped. Run diagnostics or inspect the logs before changing settings.',
      ['run-diagnostics', 'check-again', 'view-logs']
    )
  if (next?.actions.includes('repair-service') && options.serviceRepairSupported === false)
    next.actions = ['open-service-settings', 'check-again']
  if (next && diagnostics)
    next.actionHint = diagnostics.results.find((row) => row.action === next!.actions[0])?.actionHint
  return { layers, issue: next, checkedAt: snapshot.checkedAt }
}

export function recoveryActionLabel(action: RecoveryAction): string {
  const labels: Record<RecoveryAction, string> = {
    'start-core': tr('Start core'),
    'restart-core': tr('Restart core'),
    'check-again': tr('Check again'),
    'run-diagnostics': tr('Run diagnostics'),
    'open-extension-settings': tr('Open System Settings and Request Approval'),
    'open-service-settings': tr('Open service settings'),
    'repair-service': tr('Repair service'),
    'repair-firewall': tr('Repair routing firewall'),
    'open-profiles': tr('Open subscriptions'),
    'open-routing': tr('Open application routing'),
    'open-core-settings': tr('Open core settings'),
    'view-logs': tr('View logs'),
    'restart-app': tr('Restart app'),
    'open-app-settings': tr('Open application settings'),
    'enable-system-proxy': tr('Enable system proxy'),
    'restore-system-proxy': tr('Restore KokoroBox proxy settings'),
    'restore-bootstrap-dns': tr('Use system DNS as bootstrap DNS')
  }
  return labels[action]
}
