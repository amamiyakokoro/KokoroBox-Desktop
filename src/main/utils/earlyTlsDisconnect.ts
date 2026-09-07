export const EARLY_TLS_DISCONNECT_MESSAGE =
  'Client network socket disconnected before secure TLS connection was established'

type ErrorEventListener = (...args: unknown[]) => void

interface ProcessErrorEmitter {
  on: (event: string, listener: ErrorEventListener) => unknown
  off: (event: string, listener: ErrorEventListener) => unknown
}

export type MainProcessErrorOrigin = 'uncaughtException' | 'unhandledRejection'

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
