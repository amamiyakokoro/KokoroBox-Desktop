import { getAppConfig, patchControledMihomoConfig } from '../config'
import { patchMihomoConfig } from '../core/mihomoApi'
import { mainWindow } from '..'
import { ipcMain } from 'electron'
import { observeNetworkContext, readNetworkContext } from './network-context'

export async function getCurrentSSID(): Promise<string | undefined> {
  try {
    return (await readNetworkContext()).ssid
  } catch {
    return undefined
  }
}

let lastSSID: string | undefined
export async function checkSSID(currentSSID?: string): Promise<void> {
  try {
    const { pauseSSID = [] } = await getAppConfig()
    if (pauseSSID.length === 0) return
    currentSSID ??= await getCurrentSSID()
    if (currentSSID === lastSSID) return
    lastSSID = currentSSID
    if (currentSSID && pauseSSID.includes(currentSSID)) {
      await patchControledMihomoConfig({ mode: 'direct' })
      await patchMihomoConfig({ mode: 'direct' })
      mainWindow?.webContents.send('controledMihomoConfigUpdated')
      ipcMain.emit('updateTrayMenu')
    } else {
      await patchControledMihomoConfig({ mode: 'rule' })
      await patchMihomoConfig({ mode: 'rule' })
      mainWindow?.webContents.send('controledMihomoConfigUpdated')
      ipcMain.emit('updateTrayMenu')
    }
  } catch {
    // ignore
  }
}

export async function startSSIDCheck(): Promise<void> {
  observeNetworkContext(({ ssid }) => checkSSID(ssid))
}
