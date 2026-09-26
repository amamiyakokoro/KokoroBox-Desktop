import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

interface PackageInfo {
  name: string
  version: string
  license?: string
  repository?: string | { url?: string }
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

export function packageRoot(file: string): string | undefined {
  let dir = path.dirname(file.split('?')[0])
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, 'package.json'))) {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
      if (pkg.name && pkg.version) return realpathSync(dir)
    }
    dir = path.dirname(dir)
  }
  return undefined
}

function dependencyRoot(from: string, name: string): string | undefined {
  let dir = from
  while (true) {
    const candidate = path.join(dir, 'node_modules', name)
    if (existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate)
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export function collectLicenses(roots: string[]): string {
  const visited = new Set<string>()
  const entries = new Map<string, string>()
  const missing: string[] = []
  const visit = (root: string) => {
    root = realpathSync(root)
    if (visited.has(root)) return
    visited.add(root)
    const pkg: PackageInfo = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    // First-party packages retain their own licensing; do not label them third-party.
    if (!/^kokorobox-native(?:-|$)/.test(pkg.name)) {
      const files = readdirSync(root, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            /^(licen[sc]e|copying|notice|copyright)([.-]|$)|^third.?party.*notice/i.test(entry.name)
        )
        .map((entry) => entry.name)
        .sort()
      const texts = files.map(
        (name) => `${name}\n\n${readFileSync(path.join(root, name), 'utf8').trim()}`
      )
      for (const dir of ['licenses', 'LICENSES']) {
        if (!existsSync(path.join(root, dir))) continue
        for (const entry of readdirSync(path.join(root, dir), {
          recursive: true,
          withFileTypes: true
        })) {
          if (entry.isFile()) {
            const file = path.join(entry.parentPath, entry.name)
            texts.push(`${path.relative(root, file)}\n\n${readFileSync(file, 'utf8').trim()}`)
          }
        }
        // Windows resolves both spellings to the same directory.
        if (process.platform === 'win32') break
      }
      if (!texts.length) {
        const readme = path.join(root, 'README.md')
        if (existsSync(readme)) {
          const text = readFileSync(readme, 'utf8')
          if (
            /Permission is hereby granted[\s\S]*SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE\./i.test(
              text.replace(/\s+/g, ' ')
            )
          ) {
            texts.push(`README.md\n\n${text.trim()}`)
          }
        }
      }
      const supplement = path.resolve(
        'licenses',
        `${pkg.name.replaceAll('/', '+')}@${pkg.version}.txt`
      )
      if (!texts.length && existsSync(supplement)) texts.push(readFileSync(supplement, 'utf8'))
      if (!texts.length) missing.push(`${pkg.name}@${pkg.version}`)
      const source = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || ''
      entries.set(
        `${pkg.name}@${pkg.version}`,
        `${pkg.name}@${pkg.version}\nLicense: ${pkg.license || 'See license text'}\nSource: ${source}\n\n${texts.join('\n\n')}`
      )
    }
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }).sort()) {
      const dependency = dependencyRoot(root, name)
      if (dependency) visit(dependency)
      else if (!pkg.optionalDependencies?.[name])
        throw new Error(`Missing installed dependency: ${pkg.name} -> ${name}`)
    }
  }
  roots.forEach(visit)
  if (missing.length)
    throw new Error(`Missing third-party license texts:\n${missing.sort().join('\n')}`)
  return (
    [...entries]
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([, text]) => text)
      .join('\n\n' + '='.repeat(80) + '\n\n') + '\n'
  )
}

/** Collect bundled packages and their runtime dependencies, including worker packages. */
export function thirdPartyLicenses(stage: string, includeRuntime = false): Plugin {
  return {
    name: `third-party-licenses-${stage}`,
    apply: 'build',
    writeBundle() {
      const roots = new Set<string>()
      for (const id of this.getModuleIds()) {
        if (!id.replaceAll('\\', '/').includes('/node_modules/')) continue
        const root = packageRoot(id)
        if (root) roots.add(root)
      }
      if (includeRuntime) {
        const pkg: PackageInfo = JSON.parse(readFileSync('package.json', 'utf8'))
        for (const name of Object.keys(pkg.dependencies || {})) {
          const root = dependencyRoot(process.cwd(), name)
          if (!root) throw new Error(`Missing runtime dependency: ${name}`)
          roots.add(root)
        }
      }
      const text = collectLicenses([...roots])
      const output = path.resolve('out/licenses')
      mkdirSync(output, { recursive: true })
      writeFileSync(path.join(output, `${stage}.txt`), text)
      this.info(`Collected third-party licenses from ${roots.size} package roots`)
    }
  }
}
