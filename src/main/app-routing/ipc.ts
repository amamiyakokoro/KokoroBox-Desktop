import { ipcMain } from 'electron'
import { restartCore } from '../core/manager'
import { getApplicationPaths, getAppRoutingIcon } from '../sys/misc'
import { getAppRoutingConfig } from './config'
import { getAppRoutingStatus, replaceAppRoutingConfig } from './manager'

async function invokeSafely<T>(
  operation: () => T | Promise<T>
): Promise<T | { invokeError: unknown }> {
  try {
    return await operation()
  } catch (error) {
    return {
      invokeError:
        error && typeof error === 'object' && 'message' in error
          ? error.message
          : error instanceof Error || typeof error === 'string'
            ? error
            : 'Unknown Error'
    }
  }
}

export function registerAppRoutingIpcHandlers(): void {
  ipcMain.handle('getAppRoutingConfig', (_event, force) =>
    invokeSafely(() => getAppRoutingConfig(force))
  )
  ipcMain.handle('getAppRoutingStatus', () => getAppRoutingStatus())
  ipcMain.handle('replaceAppRoutingConfig', (_event, config: AppRoutingConfig) =>
    invokeSafely(async () => {
      const previous = await getAppRoutingConfig()
      const saved = await replaceAppRoutingConfig(config)
      if (previous.enabled !== saved.enabled) await restartCore()
      return saved
    })
  )
  ipcMain.handle('getApplicationPaths', () => invokeSafely(getApplicationPaths))
  ipcMain.handle('getAppRoutingIcon', (_event, iconCacheKey: string) =>
    invokeSafely(() => getAppRoutingIcon(iconCacheKey))
  )
}
