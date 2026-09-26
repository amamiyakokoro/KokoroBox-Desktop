import { tr } from '../../shared/i18n'

interface FirewallResetActions {
  platform: NodeJS.Platform
  serviceMode: boolean
  repairService: () => Promise<void>
  repairDirect: () => void | Promise<void>
}

/** Service owns the staged executable; Desktop must never guess its hash path. */
export async function resetCoreFirewall(actions: FirewallResetActions): Promise<void> {
  if (actions.platform !== 'win32') return
  try {
    if (actions.serviceMode) {
      await actions.repairService()
      return
    }
    await actions.repairDirect()
  } catch (error) {
    throw new Error(describeFirewallRepairError(error, actions.serviceMode), { cause: error })
  }
}

/** Explain the failure before IPC reduces the error to its message. */
export function describeFirewallRepairError(error: unknown, serviceMode: boolean): string {
  const detail = error instanceof Error ? error.message : String(error)
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  let guidance: string
  if (serviceMode && status === 404) {
    guidance = tr('Update KokoroBox Service to repair firewall rules for the service-managed core.')
  } else if (serviceMode && (status === 401 || status === 403)) {
    guidance = tr(
      'Service authentication failed. Reset KokoroBox Service in settings, then restart KokoroBox.'
    )
  } else if (/timed?\s*out|timeout|ETIMEDOUT/i.test(detail)) {
    guidance = tr(
      'Firewall repair timed out. The result is unconfirmed; check the service and try again.'
    )
  } else if (serviceMode && /ECONNREFUSED|ECONNRESET|ENOENT|EPIPE|socket hang up/i.test(detail)) {
    guidance = tr(
      'Cannot connect to KokoroBox Service. Check its status in Overview before trying again.'
    )
  } else if (/start the service-managed core before repairing/i.test(detail)) {
    guidance = tr(
      'The service-managed core is not running. Start it before repairing its firewall rules.'
    )
  } else if (/policy prevents local inbound exceptions|administrator policy/i.test(detail)) {
    guidance = tr(
      'Windows policy blocks local firewall changes. Contact your system administrator.'
    )
  } else if (
    /access.*denied|permission.*denied|0x80070005|EACCES|EPERM|拒絕存取|拒绝访问/i.test(detail)
  ) {
    guidance = serviceMode
      ? tr(
          'Windows denied the service permission to change firewall rules. Check system security policies.'
        )
      : tr(
          'Administrator permission is required. Run KokoroBox as administrator or use system service mode, then try again.'
        )
  } else {
    guidance = tr(
      'Could not repair the core firewall rules. See the technical details below for the cause.'
    )
  }
  return `${guidance}\n\n${tr('Error details')}\n${detail}`
}
