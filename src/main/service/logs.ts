import { tr } from '../../shared/i18n'
import type { ServiceLogSnapshot } from '../../shared/service-log'
import { getServiceLogSnapshot } from './api'
import { readServiceLogFile } from './log-file'

export async function getServiceLogs(): Promise<ServiceLogSnapshot> {
  let remoteError: unknown
  try {
    const snapshot = await getServiceLogSnapshot()
    if (snapshot) return snapshot
  } catch (error) {
    remoteError = error
  }
  try {
    const snapshot = await readServiceLogFile()
    if (snapshot.content || !remoteError) return snapshot
  } catch {
    throw new Error(
      tr('Service logs are not readable. Update KokoroBox Service and initialize it.')
    )
  }
  throw remoteError
}
