import { useSyncExternalStore } from 'react'
import { createServiceRepairState } from './service-repair-state'
import { recoverServiceBeforeReinstall } from './service-recovery'
import { tr } from '../../../shared/i18n'
import {
  initService,
  installService,
  relaunchApp,
  serviceStatus,
  testServiceConnection
} from './ipc'
import { notify } from './notification'

const serviceRepair = createServiceRepairState(async () => {
  const restartRequired = await recoverServiceBeforeReinstall({
    status: serviceStatus,
    initialize: initService,
    authenticate: testServiceConnection,
    reinstall: installService
  })
  if (!restartRequired) {
    notify(tr('Service initialized'), { variant: 'success' })
    return false
  }

  notify(tr('Service installed or repaired'), {
    id: 'service-restart-required',
    body: tr('Restart KokoroBox to apply the service repair.'),
    variant: 'success',
    persistent: true,
    forceToast: true,
    actionProps: {
      children: tr('Restart app'),
      onPress: () => void relaunchApp().catch((error) => notify(error, { variant: 'danger' }))
    }
  })
  return restartRequired
})

export const repairServiceAndPromptRestart = serviceRepair.repair

export function useServiceRepairState() {
  return useSyncExternalStore(serviceRepair.subscribe, serviceRepair.getSnapshot)
}
