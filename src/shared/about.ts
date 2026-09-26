export interface AboutDependency {
  name: string
  version: string
  license: string
  document: string
}

export interface AboutInfo {
  app: string
  service?: string
  native?: string
  proxyBridge?: string
  sysproxy?: string
  electron: string
  chromium: string
  node: string
  dependencies: AboutDependency[]
  documents: { id: string; name: string }[]
}

export function parseDependencyNotices(text: string, document: string): AboutDependency[] {
  return [...text.matchAll(/^([^\r\n]+)@([^\s]+)\r?\nLicense: ([^\r\n]+)/gm)].map(
    ([, name, version, license]) => ({ name, version, license, document })
  )
}

export function sysproxyBuildVersion(text: string): string | undefined {
  // Go build information preserves replacements on the following line.
  const match = text.match(
    /(?:^|\n)dep\t[^\t\n]*\/sysproxy-go(?:\/v\d+)?\t([^\t\r\n]+)[^\n]*\n(?:=>\t[^\t\n]+\t([^\t\r\n]+))?/
  )
  return match?.[2] || match?.[1]
}
