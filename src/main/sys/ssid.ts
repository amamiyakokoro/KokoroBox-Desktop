import { getAppConfig, patchControledMihomoConfig } from '../config'
import { patchMihomoConfig } from '../core/mihomoApi'
import { mainWindow } from '..'
import { ipcMain } from 'electron'
import { getNetworkContext } from 'kokorobox-native'

export async function getCurrentSSID(): Promise<string | undefined> {
  try {
    return (await getNetworkContext()).ssid
  } catch {
    return undefined
  }
}

let lastSSID: string | undefined
export async function checkSSID(): Promise<void> {
  try {
    const { pauseSSID = [] } = await getAppConfig()
    if (pauseSSID.length === 0) return
    const currentSSID = await getCurrentSSID()
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
  await checkSSID()
  setInterval(checkSSID, 30000)
}
