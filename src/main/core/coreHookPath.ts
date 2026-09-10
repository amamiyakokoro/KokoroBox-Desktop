import path from 'path'

export type CoreStartupMode = 'post-up' | 'log'

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

export function resolveCoreStartupMode(
  platform: NodeJS.Platform,
  configuredMode: CoreStartupMode
): CoreStartupMode {
  // Mihomo implements post-up on Windows by spawning cmd.exe and evaluating a command string.
  // A marker under the user's profile can therefore fail because of shell/path/ACL differences and
  // Mihomo treats that signalling failure as fatal. Log readiness avoids executing a shell command.
  return platform === 'win32' ? 'log' : configuredMode
}
