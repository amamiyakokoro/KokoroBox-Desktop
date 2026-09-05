import { tr } from '../../shared/i18n'
import { ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron'
import { addOverrideItem, addProfileItem } from '../config'
import { getUserAgent } from '../utils/userAgent'
import { showNotification } from '../utils/notification'
import { handleKokoroCallback, KOKORO_REDIRECT_URI } from '../kokoro/client'

interface DeepLinkContext {
  getMainWindow: () => BrowserWindow | null
  createWindow: () => Promise<void>
  showWindow: () => number
}

export async function handleDeepLink(url: string, context: DeepLinkContext): Promise<void> {
  if (url.startsWith(`${new URL(KOKORO_REDIRECT_URI).protocol}//`)) {
    try {
      await handleKokoroCallback(new URL(url))
      if (!context.getMainWindow()) await context.createWindow()
      context.showWindow()
      void showNotification({ title: tr('Kokoro 登录成功'), variant: 'success' })
    } catch (error) {
      void showNotification({ title: tr('Kokoro 登录失败'), body: `${error}`, variant: 'danger' })
    } finally {
      context.getMainWindow()?.webContents.send('kokoro-auth-changed')
    }
    return
  }

  if (!url.startsWith('clash://') && !url.startsWith('mihomo://') && !url.startsWith('sparkle://'))
    return

  const urlObj = new URL(url)
  switch (urlObj.host) {
    case 'install-config': {
      try {
        const profileUrl = urlObj.searchParams.get('url')
        const profileName = urlObj.searchParams.get('name')
        if (!profileUrl) {
          throw new Error(tr('缺少参数 url'))
        }

        const confirmed = await showProfileInstallConfirm(profileUrl, profileName, context)

        if (confirmed) {
          await addProfileItem({
            type: 'remote',
            name: profileName ?? undefined,
            url: profileUrl
          })
          context.getMainWindow()?.webContents.send('profileConfigUpdated')
          void showNotification({ title: tr('订阅导入成功'), variant: 'success' })
        }
      } catch (error) {
        void showNotification({
          title: tr('订阅导入失败'),
          body: `${url}\n${error}`,
          variant: 'danger'
        })
      }
      break
    }
    case 'install-override': {
      try {
        const urlParam = urlObj.searchParams.get('url')
        const profileName = urlObj.searchParams.get('name')
        if (!urlParam) {
          throw new Error(tr('缺少参数 url'))
        }

        const confirmed = await showOverrideInstallConfirm(urlParam, profileName, context)

        if (confirmed) {
          const overrideUrl = new URL(urlParam)
          const name = overrideUrl.pathname.split('/').pop()
          await addOverrideItem({
            type: 'remote',
            name: profileName ?? (name ? decodeURIComponent(name) : undefined),
            url: urlParam,
            ext: overrideUrl.pathname.endsWith('.js') ? 'js' : 'yaml'
          })
          context.getMainWindow()?.webContents.send('overrideConfigUpdated')
          void showNotification({ title: tr('覆写导入成功'), variant: 'success' })
        }
      } catch (error) {
        void showNotification({
          title: tr('覆写导入失败'),
          body: `${url}\n${error}`,
          variant: 'danger'
        })
      }
      break
    }
  }
}

async function showProfileInstallConfirm(
  url: string,
  name: string | null,
  context: DeepLinkContext
): Promise<boolean> {
  if (!context.getMainWindow()) {
    await context.createWindow()
  }
  let extractedName = name

  if (!extractedName) {
    try {
      const axios = (await import('axios')).default
      const response = await axios.head(url, {
        headers: {
          'User-Agent': await getUserAgent()
        },
        timeout: 5000
      })

      if (response.headers['content-disposition']) {
        extractedName = parseFilename(response.headers['content-disposition'])
      }
    } catch {
      // ignore
    }
  }

  return new Promise((resolve) => {
    const delay = context.showWindow()
    setTimeout(() => {
      context.getMainWindow()?.webContents.send('show-profile-install-confirm', {
        url,
        name: extractedName || name
      })
      const handleConfirm = (_event: IpcMainEvent, confirmed: boolean): void => {
        ipcMain.off('profile-install-confirm-result', handleConfirm)
        resolve(confirmed)
      }
      ipcMain.once('profile-install-confirm-result', handleConfirm)
    }, delay)
  })
}

function parseFilename(str: string): string {
  if (str.match(/filename\*=.*''/)) {
    return decodeURIComponent(str.split(/filename\*=.*''/)[1])
  }
  return str.split('filename=')[1]?.replace(/"/g, '') || ''
}

async function showOverrideInstallConfirm(
  url: string,
  name: string | null,
  context: DeepLinkContext
): Promise<boolean> {
  if (!context.getMainWindow()) {
    await context.createWindow()
  }
  return new Promise((resolve) => {
    let finalName = name ?? undefined
    if (!finalName) {
      const urlObj = new URL(url)
      const pathName = urlObj.pathname.split('/').pop()
      finalName = pathName ? decodeURIComponent(pathName) : undefined
    }

    const delay = context.showWindow()
    setTimeout(() => {
      context.getMainWindow()?.webContents.send('show-override-install-confirm', {
        url,
        name: finalName
      })
      const handleConfirm = (_event: IpcMainEvent, confirmed: boolean): void => {
        ipcMain.off('override-install-confirm-result', handleConfirm)
        resolve(confirmed)
      }
      ipcMain.once('override-install-confirm-result', handleConfirm)
    }, delay)
  })
}
