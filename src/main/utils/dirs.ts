import { tr } from '../../shared/i18n'
import { is } from '@electron-toolkit/utils'
import { existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import path from 'path'
import { findExecutables } from 'kokorobox-native'
import { getAppConfigSync } from '../config/app'
import { checkCorePermissionPathSync } from '../core/permission-check'
import {
  systemCoreDefaultPath,
  systemCoreOnlyBuild,
  systemServicePath
} from '../../shared/build-flags'

export const homeDir = app.getPath('home')

export function isPortable(): boolean {
  return existsSync(path.join(exeDir(), 'PORTABLE'))
}

export function dataDir(): string {
  if (isPortable()) {
    return path.join(exeDir(), 'data')
  } else {
    return app.getPath('userData')
  }
}

export function taskDir(): string {
  const dir = path.join(app.getPath('userData'), 'tasks')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function exeDir(): string {
  return path.dirname(exePath())
}

export function exePath(): string {
  return app.getPath('exe')
}

export function resourcesDir(): string {
  if (is.dev) {
    return path.join(__dirname, '../../extra')
  } else {
    if (app.getAppPath().endsWith('asar')) {
      return process.resourcesPath
    } else {
      return path.join(app.getAppPath(), 'resources')
    }
  }
}

export function resourcesFilesDir(): string {
  return path.join(resourcesDir(), 'files')
}

export function themesDir(): string {
  return path.join(dataDir(), 'themes')
}

export function mihomoIpcPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\KokoroBox\\mihomo'
  }
  const { core = 'mihomo' } = getAppConfigSync()
  if (core === 'system') {
    return '/tmp/kokorobox-mihomo-external.sock'
  }
  if (!checkCorePermissionPathSync(mihomoCorePath(core))) {
    return '/tmp/kokorobox-mihomo-api-noperm.sock'
  }
  return '/tmp/kokorobox-mihomo-api.sock'
}

export function serviceIpcPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\kokorobox\\service'
  }
  return '/tmp/kokorobox-service.sock'
}

export function mihomoCoreDir(): string {
  if (systemCoreOnlyBuild) {
    return path.dirname(systemCorePath())
  }
  return path.join(resourcesDir(), 'sidecar')
}

export function mihomoCorePath(core: string): string {
  if (core === 'mihomo' || core === 'mihomo-alpha') {
    const isWin = process.platform === 'win32'
    return path.join(mihomoCoreDir(), `${core}${isWin ? '.exe' : ''}`)
  }
  if (core === 'system') {
    const sysPath = systemCorePath()
    if (!sysPath || !existsSync(sysPath)) {
      const errorMsg = sysPath
        ? tr('System core path is invalid or missing: {0}', [sysPath])
        : tr('System core path is not set')
      throw new Error(errorMsg)
    }
    return sysPath
  }
  throw new Error(tr('Invalid core path'))
}

function systemCorePath(): string {
  const { systemCorePath = '' } = getAppConfigSync()
  return systemCorePath || systemCoreDefaultPath
}

export function servicePath(): string {
  if (systemCoreOnlyBuild) return systemServicePath
  const isWin = process.platform === 'win32'
  return path.join(resourcesFilesDir(), `kokorobox-service${isWin ? '.exe' : ''}`)
}

export function macOSServiceRuntimePath(): string {
  return '/Library/PrivilegedHelperTools/com.amamiyakokoro.kokorobox-service'
}

export function macOSServicePlistPath(): string {
  return '/Library/LaunchDaemons/KokoroBoxService.plist'
}

export function serviceAuthStorePath(): string {
  return path.join(dataDir(), 'service-auth.json')
}

export function kokoroAuthStorePath(): string {
  return path.join(dataDir(), 'kokoro-auth.json')
}

export function appRoutingDir(): string {
  return path.join(dataDir(), 'app-routing')
}

export function appRoutingConfigPath(): string {
  return path.join(appRoutingDir(), 'config.json')
}

export function appRoutingIconDir(): string {
  return path.join(appRoutingDir(), 'icons')
}

export function processRouterDir(): string {
  return path.join(resourcesFilesDir(), 'process-router')
}

export function processRouterPath(): string {
  return path.join(processRouterDir(), 'kokorobox-process-router.exe')
}

export function macAppRoutingModulePath(): string {
  return (
    process.env.KOKOROBOX_MACOS_ROUTING_MODULE ||
    path.join(resourcesFilesDir(), 'macos-app-routing', 'kokorobox-app-routing.node')
  )
}

export function macAppRoutingExtensionPath(): string {
  return path.join(
    path.dirname(resourcesDir()),
    'Library',
    'SystemExtensions',
    'com.amamiyakokoro.app.proxy-extension.systemextension'
  )
}

export function appConfigPath(): string {
  return path.join(dataDir(), 'config.yaml')
}

export function controledMihomoConfigPath(): string {
  return path.join(dataDir(), 'mihomo.yaml')
}

export function profileConfigPath(): string {
  return path.join(dataDir(), 'profile.yaml')
}

export function profilesDir(): string {
  return path.join(dataDir(), 'profiles')
}

export function profilePath(id: string): string {
  return path.join(profilesDir(), `${id}.yaml`)
}

export function overrideDir(): string {
  return path.join(dataDir(), 'override')
}

export function overrideConfigPath(): string {
  return path.join(dataDir(), 'override.yaml')
}

export function overridePath(id: string, ext: 'js' | 'yaml' | 'log'): string {
  return path.join(overrideDir(), `${id}.${ext}`)
}

export function mihomoWorkDir(): string {
  return path.join(dataDir(), 'work')
}

export function mihomoProfileWorkDir(id: string | undefined): string {
  return path.join(mihomoWorkDir(), id || 'default')
}

export function mihomoTestDir(): string {
  return path.join(dataDir(), 'test')
}

export function mihomoWorkConfigPath(id: string | undefined): string {
  if (id === 'work') {
    return path.join(mihomoWorkDir(), 'config.yaml')
  } else {
    return path.join(mihomoProfileWorkDir(id), 'config.yaml')
  }
}

export function logDir(): string {
  return path.join(dataDir(), 'logs')
}

function datedLogPath(prefix?: string): string {
  const date = new Date()
  const name = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  return path.join(logDir(), `${prefix ? `${prefix}-` : ''}${name}.log`)
}

export function logPath(): string {
  return datedLogPath()
}

export function appLogPath(): string {
  return datedLogPath('app')
}

export function coreLogPath(): string {
  return datedLogPath('core')
}

export async function findSystemMihomo(): Promise<string[]> {
  const foundPaths: string[] = []

  if (systemCoreDefaultPath && existsSync(systemCoreDefaultPath)) {
    foundPaths.push(systemCoreDefaultPath)
  }

  const candidates = await findExecutables({
    names: ['mihomo', 'clash'],
    matchNamePrefixes: process.platform !== 'win32'
  })
  foundPaths.push(...candidates.map((candidate) => candidate.path))

  return Array.from(new Set(foundPaths)).sort()
}
