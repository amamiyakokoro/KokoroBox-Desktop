import { getCorePrivilegeStatus } from 'kokorobox-native'

export function checkCorePermissionPathSync(corePath: string): boolean {
  if (process.platform === 'win32') return true
  try {
    return getCorePrivilegeStatus([corePath])[0]?.granted === true
  } catch {
    return false
  }
}
