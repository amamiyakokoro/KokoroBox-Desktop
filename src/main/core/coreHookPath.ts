import path from 'path'
import { productIdentity } from '../../shared/product-identity'

export function resolveCoreHookDirectory(
  platform: NodeJS.Platform,
  programData: string | undefined,
  userDataPath: string
): string {
  if (platform === 'win32' && programData) {
    return path.win32.join(programData, productIdentity.systemStateDirectory, 'core-hooks')
  }
  return path.join(userDataPath, 'core-hooks')
}
