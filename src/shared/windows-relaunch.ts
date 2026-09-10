export const windowsRelaunchWaitArgumentPrefix = '--kokorobox-relaunch-wait-pid='

export function windowsRelaunchWaitArgument(pid: number): string {
  return `${windowsRelaunchWaitArgumentPrefix}${pid}`
}

export function getWindowsRelaunchWaitPid(argv: string[]): number | undefined {
  const argument = argv.find((value) => value.startsWith(windowsRelaunchWaitArgumentPrefix))
  if (!argument) return undefined

  const pid = Number.parseInt(argument.slice(windowsRelaunchWaitArgumentPrefix.length), 10)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}
