import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Plugin } from 'vite'

// Electron's generated credits escape preformatted license text with HTML entities.
// Decode once so literal entity spellings in the original text remain unchanged.
function decodeCreditsText(text: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (_, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()]
    const hex = entity[1].toLowerCase() === 'x'
    return String.fromCodePoint(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10))
  })
}

/** Extract one complete license from Electron's generated LICENSES.chromium.html. */
export function electronCreditLicense(html: string, title: string): string {
  const matches = html.split(/<div\s+class="product"\s*>/).filter((block) => {
    const name = block.match(/<span\s+class="title"\s*>([^<]*)<\/span>/)?.[1]
    return name !== undefined && decodeCreditsText(name) === title
  })
  if (matches.length !== 1) throw new Error(`Expected one Electron credit for ${title}`)
  const texts = [...matches[0].matchAll(/<pre>([\s\S]*?)<\/pre>/g)]
  if (texts.length !== 1 || !texts[0][1].trim() || texts[0][1].includes('<'))
    throw new Error(`Invalid Electron license text for ${title}`)
  return decodeCreditsText(texts[0][1]).trim() + '\n'
}

export function writeElectronComponentLicenses(
  dist: string,
  version: string,
  output: string
): void {
  const installedVersion = readFileSync(path.join(dist, 'version'), 'utf8').trim().replace(/^v/, '')
  if (installedVersion !== version) throw new Error('Electron license artifact version mismatch')
  const electron = readFileSync(path.join(dist, 'LICENSE'), 'utf8')
  if (!electron.trim()) throw new Error('Empty Electron license')
  const credits = readFileSync(path.join(dist, 'LICENSES.chromium.html'), 'utf8')
  const licenses = {
    'LICENSE.Electron': electron,
    'LICENSE.Chromium': electronCreditLicense(credits, 'The Chromium Project'),
    'LICENSE.Node': electronCreditLicense(credits, 'Node.js')
  }
  mkdirSync(output, { recursive: true })
  for (const [name, text] of Object.entries(licenses)) writeFileSync(path.join(output, name), text)
}

/** Use the actual installed Electron distribution rather than a stale runtime license backup. */
export function componentLicenses(): Plugin {
  return {
    name: 'component-licenses',
    apply: 'build',
    writeBundle() {
      const require = createRequire(path.resolve('package.json'))
      const packageFile = require.resolve('electron/package.json')
      const { version } = JSON.parse(readFileSync(packageFile, 'utf8'))
      const dist =
        process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(path.dirname(packageFile), 'dist')
      writeElectronComponentLicenses(dist, version, path.resolve('out/licenses'))
    }
  }
}
