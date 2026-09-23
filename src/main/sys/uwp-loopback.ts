import { setUwpLoopbackExemption as setNativeUwpLoopbackExemption } from 'kokorobox-native'
import { setServiceUwpLoopbackExemption, supportsServiceUwpLoopback } from '../service/api'
import { checkElevateTask } from './misc'

export async function canManageUwpLoopback(): Promise<boolean> {
  return (await supportsServiceUwpLoopback()) || (await checkElevateTask())
}

export async function setUwpLoopbackExemption(id: string, enabled: boolean): Promise<void> {
  if (await supportsServiceUwpLoopback()) {
    await setServiceUwpLoopbackExemption(id, enabled)
  } else {
    await setNativeUwpLoopbackExemption(id, enabled)
  }
}
