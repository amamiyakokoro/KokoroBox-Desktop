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

/** Resolve repository-relative notice links to the offline license inventory. */
export function resolveLicenseDocumentLink(
  name: string,
  href: string,
  documents: AboutInfo['documents']
): AboutInfo['documents'][number] | undefined {
  if (!href || href.startsWith('#') || href.startsWith('//') || /^[\w+.-]+:/.test(href))
    return undefined
  try {
    const base = name === 'THIRD_PARTY_NOTICES.md' ? name : `licenses/${name}`
    const url = new URL(href, `https://licenses.invalid/${base}`)
    if (!url.pathname.startsWith('/licenses/')) return undefined
    const target = decodeURIComponent(url.pathname.slice('/licenses/'.length))
    return documents.find((document) => document.name === target)
  } catch {
    return undefined
  }
}

export function parseDependencyNotices(text: string, document: string): AboutDependency[] {
  return [...text.matchAll(/^([^\r\n]+)@([^\s]+)\r?\nLicense: ([^\r\n]+)/gm)].map(
    ([, name, version, license]) => ({ name, version, license, document })
  )
}

/** Display the project covered by a standalone license, rather than its backup filename. */
export function licenseProjectForDocument(name: string): string | undefined {
  if (name === 'README.md' || /^(main|renderer|preload)\.txt$/.test(name)) return undefined
  if (name === 'THIRD_PARTY_NOTICES.md') return undefined
  // These supplements belong to individual packages in the generated npm notices.
  if (/^(?:@[^/]+\+)?[^/]+@[^/]+\.txt$/.test(name)) return undefined
  const terms: Record<string, string> = {
    'Apache-2.0.txt': 'Twemoji Mozilla · Apache-2.0',
    'CC-BY-4.0.txt': 'Twemoji Mozilla / Font Awesome · CC-BY-4.0',
    'CC-BY-SA-3.0.txt': 'Typicons · CC-BY-SA-3.0'
  }
  if (terms[name]) return terms[name]
  if (name.startsWith('LICENSE.')) {
    const projects: Record<string, string> = {
      CloudflareSpeedtest: 'Cloudflare Speedtest',
      Twemoji: 'Twemoji Mozilla',
      'circle-flags': 'circle-flags'
    }
    const project = name.slice('LICENSE.'.length)
    return projects[project] || project
  }
  if (name.startsWith('icons/') && name.endsWith('.txt')) {
    const iconSets: Record<string, string> = {
      'ant-design': 'Ant Design',
      boxicons: 'Boxicons',
      'css-gg': 'css.gg',
      feather: 'Feather',
      'font-awesome': 'Font Awesome',
      'font-awesome6': 'Font Awesome 6',
      grommet: 'Grommet Icons',
      heroicons: 'Heroicons',
      heroicons2: 'Heroicons 2',
      ionicons: 'Ionicons',
      ionicons5: 'Ionicons 5',
      lucide: 'Lucide',
      'material-design': 'Material Design',
      remix: 'Remix Icon',
      tabler: 'Tabler Icons',
      typicons: 'Typicons'
    }
    const icon = name.slice('icons/'.length, -'.txt'.length)
    return `react-icons · ${iconSets[icon] || icon}`
  }
  return name.replace(/\.txt$/, '')
}

export function sysproxyBuildVersion(text: string): string | undefined {
  // Go build information preserves replacements on the following line.
  const match = text.match(
    /(?:^|\n)dep\t[^\t\n]*\/sysproxy-go(?:\/v\d+)?\t([^\t\r\n]+)[^\n]*\n(?:=>\t[^\t\n]+\t([^\t\r\n]+))?/
  )
  return match?.[2] || match?.[1]
}
