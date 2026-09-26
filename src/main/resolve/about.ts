import { app } from 'electron'
import { readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { getServiceMeta } from '../service/api'
import { servicePath } from '../utils/dirs'
import { parseDependencyNotices, sysproxyBuildVersion, type AboutInfo } from '../../shared/about'

async function licenseDocuments(): Promise<{ id: string; name: string; file: string }[]> {
  const roots = app.isPackaged
    ? [path.join(process.resourcesPath, 'licenses')]
    : [path.join(app.getAppPath(), 'licenses'), path.join(app.getAppPath(), 'out/licenses')]
  const result: { id: string; name: string; file: string }[] = []
  for (const [index, root] of roots.entries()) {
    let entries
    try {
      entries = await readdir(root, { recursive: true, withFileTypes: true })
    } catch {
      continue
    }
    const resolvedRoot = await realpath(root)
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const file = path.join(entry.parentPath, entry.name)
      const relative = path.relative(resolvedRoot, await realpath(file))
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue
      const name = path.relative(root, file).replaceAll('\\', '/')
      result.push({ id: `${index}:${name}`, name, file })
    }
  }
  result.push({
    id: 'notices',
    name: 'THIRD_PARTY_NOTICES.md',
    file: path.join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      'THIRD_PARTY_NOTICES.md'
    )
  })
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

export async function readAboutLicense(id: unknown): Promise<string> {
  if (typeof id !== 'string') throw new Error('Invalid license document')
  const document = (await licenseDocuments()).find((item) => item.id === id)
  if (!document) throw new Error('Unknown license document')
  return readFile(document.file, 'utf8')
}

export async function getAboutInfo(): Promise<AboutInfo> {
  const documents = await licenseDocuments()
  const dependencies = new Map<string, AboutInfo['dependencies'][number]>()
  for (const document of documents.filter((item) =>
    /^(main|renderer|preload)\.txt$/.test(item.name)
  )) {
    for (const item of parseDependencyNotices(await readFile(document.file, 'utf8'), document.id)) {
      dependencies.set(`${item.name}@${item.version}`, item)
    }
  }
  const result: AboutInfo = {
    app: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    documents: documents.map(({ id, name }) => ({ id, name })),
    dependencies: [...dependencies.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
  await Promise.allSettled([
    (async () => {
      const meta = await getServiceMeta()
      if (meta.serviceVersion !== 'legacy') result.service = meta.serviceVersion
    })(),
    (async () => {
      const require = createRequire(__filename)
      const file = path.join(path.dirname(require.resolve('kokorobox-native')), 'package.json')
      result.native = JSON.parse(await readFile(file, 'utf8')).version
    })(),
    (async () => {
      const root = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'extra')
      const directory = process.platform === 'darwin' ? 'macos-app-routing' : 'process-router'
      if (process.platform !== 'win32' && process.platform !== 'darwin') return
      const manifest = JSON.parse(
        await readFile(path.join(root, 'files', directory, 'manifest.json'), 'utf8')
      )
      if (typeof manifest.proxyBridgeRevision === 'string')
        result.proxyBridge = manifest.proxyBridgeRevision
    })(),
    (async () => {
      result.sysproxy = sysproxyBuildVersion((await readFile(servicePath())).toString('utf8'))
    })()
  ])
  return result
}
