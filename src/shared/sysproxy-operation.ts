export type SysProxyOperationPhase =
  'idle' | 'enabling' | 'disabling' | 'waiting-network' | 'unconfirmed'

export interface SysProxyOperationState {
  revision: number
  phase: SysProxyOperationPhase
  desired: boolean | null
  confirmed: boolean | null
  error?: string
}

export function readSystemProxyEnabled(status: Record<string, unknown>): boolean | null {
  for (const value of [status.enabled, status.active, status.is_enabled]) {
    if (typeof value === 'boolean') return value
  }
  return null
}
