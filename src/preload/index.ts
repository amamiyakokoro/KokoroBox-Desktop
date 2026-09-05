import { contextBridge, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  locale: process.argv.includes('--kokorobox-locale=en')
    ? 'en'
    : process.argv.includes('--kokorobox-locale=zh-TW')
      ? 'zh-TW'
      : 'zh-CN',
  webUtils: webUtils,
  platform: process.platform
}
// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
