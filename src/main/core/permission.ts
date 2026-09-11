import { tr } from '../../shared/i18n'
import { mihomoCorePath } from '../utils/dirs'
import { checkCorePermissionPathSync } from './permission-check'
import { getCorePrivilegeStatus, isRunningAsAdmin, setCorePrivileges } from 'kokorobox-native'

type CoreName = 'mihomo' | 'mihomo-alpha'

class UserCancelledError extends Error {
  constructor(message = tr('用户取消操作')) {
    super(message)
    this.name = 'UserCancelledError'
  }
}

function isUserCancelledError(error: unknown): boolean {
  if (error instanceof UserCancelledError) {
    return true
  }
  const errorMsg = error instanceof Error ? error.message : String(error)
  return (
    /(?:用户|用戶|使用者)已取消/.test(errorMsg) ||
    errorMsg.includes('User canceled') ||
    errorMsg.includes('(-128)') ||
    errorMsg.includes('user cancelled') ||
    errorMsg.includes('dismissed')
  )
}

export async function manualGrantCorePermition(cores?: CoreName[]): Promise<void> {
  if (process.platform === 'win32') {
    if (!isRunningAsAdmin()) throw new Error(tr('请以管理员身份重新启动 KokoroBox'))
    return
  }
  if (process.platform === 'darwin') {
    throw new Error(tr('macOS 特权功能需要 KokoroBox 服务，请安装或修复服务'))
  }

  const targetCores = cores || ['mihomo', 'mihomo-alpha']
  try {
    await setCorePrivileges(targetCores.map(mihomoCorePath), true)
  } catch (error) {
    if (isUserCancelledError(error)) throw new UserCancelledError()
    throw error
  }
}

export function checkCorePermissionSync(coreName: CoreName): boolean {
  return checkCorePermissionPathSync(mihomoCorePath(coreName))
}

export async function checkCorePermission(): Promise<{ mihomo: boolean; 'mihomo-alpha': boolean }> {
  if (process.platform === 'win32') {
    const granted = isRunningAsAdmin()
    return { mihomo: granted, 'mihomo-alpha': granted }
  }

  const checkPermission = (coreName: CoreName): boolean => {
    try {
      return getCorePrivilegeStatus([mihomoCorePath(coreName)])[0]?.granted === true
    } catch {
      return false
    }
  }

  return {
    mihomo: checkPermission('mihomo'),
    'mihomo-alpha': checkPermission('mihomo-alpha')
  }
}

export async function revokeCorePermission(cores?: CoreName[]): Promise<void> {
  if (process.platform === 'win32') return
  if (process.platform === 'darwin') {
    throw new Error(tr('macOS 特权功能需要 KokoroBox 服务，请安装或修复服务'))
  }

  const targetCores = cores || ['mihomo', 'mihomo-alpha']
  try {
    await setCorePrivileges(targetCores.map(mihomoCorePath), false)
  } catch (error) {
    if (isUserCancelledError(error)) throw new UserCancelledError()
    throw error
  }
}
