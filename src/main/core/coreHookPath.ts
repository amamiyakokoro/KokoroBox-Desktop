import path from 'path'

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function resolveCoreHookDirectory(platform: NodeJS.Platform, userDataPath: string): string {
  return platform === 'win32'
    ? path.win32.join(userDataPath, 'core-hooks')
    : path.join(userDataPath, 'core-hooks')
}

export function resolveCoreHookTouchCommand(platform: NodeJS.Platform, file: string): string {
  return platform === 'win32' ? `type nul > "${file}"` : `: > ${shellQuote(file)}`
}
