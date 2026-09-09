export const EARLY_TLS_DISCONNECT_MESSAGE =
  'Client network socket disconnected before secure TLS connection was established'
const NETWORK_TRANSITION_GRACE_MS = 5_000

type ErrorEventListener = (...args: unknown[]) => void

interface ProcessErrorEmitter {
  on: (event: string, listener: ErrorEventListener) => unknown
  off: (event: string, listener: ErrorEventListener) => unknown
}

export type MainProcessErrorOrigin = 'uncaughtException' | 'unhandledRejection'

let activeNetworkTransitions = 0
let networkTransitionGraceUntil = 0

/**
 * Marks an intentional network interruption, such as restarting Mihomo after
 * changing TUN mode. Existing TLS handshakes may fail while routes and local
 * proxy listeners are replaced; those failures are expected and should be
 * logged without alarming the user.
 */
export function beginExpectedNetworkTransition(
  now: () => number = Date.now,
  graceMs = NETWORK_TRANSITION_GRACE_MS
): () => void {
  activeNetworkTransitions += 1
  let finished = false

  return () => {
    if (finished) return
    finished = true
    activeNetworkTransitions = Math.max(0, activeNetworkTransitions - 1)
    networkTransitionGraceUntil = Math.max(networkTransitionGraceUntil, now() + graceMs)
  }
}

export function isExpectedNetworkTransition(now: number = Date.now()): boolean {
  return activeNetworkTransitions > 0 || now <= networkTransitionGraceUntil
}

export function resetExpectedNetworkTransitionForTest(): void {
  activeNetworkTransitions = 0
  networkTransitionGraceUntil = 0
}

function errorCause(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('cause' in value)) return undefined
  return value.cause
}

export function isEarlyTlsDisconnect(value: unknown): value is Error {
  const visited = new Set<unknown>()
  let current = value

  for (let depth = 0; current && depth < 5 && !visited.has(current); depth += 1) {
    visited.add(current)
    if (current instanceof Error && current.message.includes(EARLY_TLS_DISCONNECT_MESSAGE)) {
      return true
    }
    current = errorCause(current)
  }

  return false
}

/**
 * Electron turns an unhandled rejection into its fatal main-process error
 * dialog. Recover only the known, transient TLS handshake disconnect and keep
 * the default fatal behaviour for every other programming error.
 */
export function installEarlyTlsDisconnectRecovery(
  report: (error: Error, origin: MainProcessErrorOrigin) => void,
  emitter: ProcessErrorEmitter = process,
  rethrow: (reason: unknown) => void = (reason) => {
    throw reason
  }
): () => void {
  let installed = true

  const uninstall = (): void => {
    if (!installed) return
    installed = false
    emitter.off('unhandledRejection', onUnhandledRejection)
    emitter.off('uncaughtException', onUncaughtException)
  }

  const onUnhandledRejection: ErrorEventListener = (reason) => {
    if (isEarlyTlsDisconnect(reason)) {
      report(reason, 'unhandledRejection')
      return
    }
    rethrow(reason)
  }

  const onUncaughtException: ErrorEventListener = (error) => {
    if (isEarlyTlsDisconnect(error)) {
      report(error, 'uncaughtException')
      return
    }

    // Avoid catching our own rethrow and preserve the existing fatal handling.
    uninstall()
    rethrow(error)
  }

  emitter.on('unhandledRejection', onUnhandledRejection)
  emitter.on('uncaughtException', onUncaughtException)
  return uninstall
}
