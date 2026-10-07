import { randomUUID } from 'node:crypto'
import { tr } from '../../shared/i18n'
import { ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron'
import { addOverrideItem, addProfileItem } from '../config'
import { getUserAgent } from '../utils/userAgent'
import { showNotification } from '../utils/notification'
import { handleKokoroCallback, KokoroAPIError } from '../kokoro/client'
import { isKokoroURI } from '../kokoro/oauth'
import { isConfigUri } from '../../shared/product-identity'

interface DeepLinkContext {
  getMainWindow: () => BrowserWindow | null
  createWindow: () => Promise<void>
  showWindow: () => number
}

let confirmationQueue: Promise<unknown> = Promise.resolve()

function showImportConfirmation(
  kind: 'profile' | 'override',
  url: string,
  name: string | null | undefined,
  context: DeepLinkContext
): Promise<boolean> {
  const result = confirmationQueue.then(async () => {
    if (!context.getMainWindow()) await context.createWindow()
    const window = context.getMainWindow()
    if (!window || window.isDestroyed()) return false
    const requestId = randomUUID()
    const channel = `${kind}-install-confirm-result`
    return await new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (confirmed: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(deadline)
        clearTimeout(showTimer)
        ipcMain.off(channel, onReply)
        window.off('closed', onClosed)
        resolve(confirmed)
      }
      const onReply = (
        event: IpcMainEvent,
        reply: { requestId?: unknown; confirmed?: unknown } | null
      ): void => {
        if (
          event.sender !== window.webContents ||
          !reply ||
          reply.requestId !== requestId ||
          typeof reply.confirmed !== 'boolean'
        )
          return
        finish(reply.confirmed)
      }
      const onClosed = (): void => finish(false)
      const deadline = setTimeout(() => finish(false), 5 * 60_000)
      const showTimer = setTimeout(() => {
        if (window.isDestroyed()) {
          finish(false)
          return
        }
        try {
          window.webContents.send(`show-${kind}-install-confirm`, { requestId, url, name })
        } catch {
          finish(false)
        }
      }, context.showWindow())
      ipcMain.on(channel, onReply)
      window.once('closed', onClosed)
    })
  })
  confirmationQueue = result.catch(() => undefined)
  return result
}

export async function handleDeepLink(url: string, context: DeepLinkContext): Promise<void> {
  if (isKokoroURI(url)) {
    try {
      if (!context.getMainWindow()) await context.createWindow()
      context.showWindow()
      await handleKokoroCallback(url)
      if (!context.getMainWindow()) await context.createWindow()
      context.showWindow()
      void showNotification({ title: tr('Signed in to Kokoro'), variant: 'success' })
    } catch (error) {
      void showNotification({
        title: tr('Kokoro sign-in failed'),
        body: error instanceof KokoroAPIError ? error.message : tr('Kokoro request failed'),
        variant: 'danger'
      })
    }
    return
  }

  if (!isConfigUri(url)) return

  const urlObj = new URL(url)
  switch (urlObj.host) {
    case 'install-config': {
      try {
        const profileUrl = urlObj.searchParams.get('url')
        const profileName = urlObj.searchParams.get('name')
        if (!profileUrl) {
          throw new Error(tr('Missing url parameter'))
        }

        const confirmed = await showProfileInstallConfirm(profileUrl, profileName, context)

        if (confirmed) {
          await addProfileItem({
            type: 'remote',
            name: profileName ?? undefined,
            url: profileUrl
          })
          context.getMainWindow()?.webContents.send('profileConfigUpdated')
          void showNotification({ title: tr('Subscription imported'), variant: 'success' })
        }
      } catch (error) {
        void showNotification({
          title: tr('Subscription import failed'),
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
          throw new Error(tr('Missing url parameter'))
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
          void showNotification({ title: tr('Override imported'), variant: 'success' })
        }
      } catch (error) {
        void showNotification({
          title: tr('Override import failed'),
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

  return await showImportConfirmation('profile', url, extractedName || name, context)
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
  const pathName = new URL(url).pathname.split('/').pop()
  const finalName = name ?? (pathName ? decodeURIComponent(pathName) : undefined)
  return await showImportConfirmation('override', url, finalName, context)
}
