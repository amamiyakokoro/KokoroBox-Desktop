import { tr } from '../../../shared/i18n'
import { installService, relaunchApp } from './ipc'
import { notify } from './notification'

export async function repairServiceAndPromptRestart(): Promise<void> {
  await installService()
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
}
