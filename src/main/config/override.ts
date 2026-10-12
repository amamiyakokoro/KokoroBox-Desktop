import { assertManagedConfig } from '../../shared/managed-id'
import { tr } from '../../shared/i18n'
import { overrideConfigPath, overridePath } from '../utils/dirs'
import { getControledMihomoConfig } from './controledMihomo'
import { readFile, rm } from 'fs/promises'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { existsSync } from 'fs'
import axios, { AxiosResponse } from 'axios'
import https from 'https'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { getUserAgent } from '../utils/userAgent'
import { createPinnedHttpsAgent } from '../utils/pinnedHttpsAgent'
import { writePrivateTextFileAtomic } from './atomic-file'

let overrideConfig: OverrideConfig // override.yaml
let writePromise: Promise<void> = Promise.resolve()
let mutationPromise: Promise<unknown> = Promise.resolve()
const revisions = new Map<string, number>()
function withMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationPromise.then(operation)
  mutationPromise = result.catch(() => undefined)
  return result
}
function bumpRevision(id: string): void {
  revisions.set(id, (revisions.get(id) || 0) + 1)
}

export async function getOverrideConfig(force = false): Promise<OverrideConfig> {
  await writePromise
  if (force || !overrideConfig) {
    const data = await readFile(overrideConfigPath(), 'utf-8')
    overrideConfig = parseYaml<OverrideConfig>(data) || { items: [] }
  }
  if (typeof overrideConfig !== 'object') overrideConfig = { items: [] }
  assertManagedConfig(overrideConfig, 'override')
  return structuredClone(overrideConfig)
}

async function setOverrideConfigUnlocked(config: OverrideConfig): Promise<void> {
  assertManagedConfig(config, 'override')
  const previousConfig = await getOverrideConfig()
  const nextConfig = structuredClone(config)
  const previousPromise = writePromise
  const currentPromise = (async () => {
    await previousPromise
    const configPath = overrideConfigPath()
    await writePrivateTextFileAtomic(configPath, stringifyYaml(nextConfig))
    for (const id of new Set(
      [...previousConfig.items, ...nextConfig.items].map((item) => item.id)
    )) {
      if (
        !isDeepStrictEqual(
          previousConfig.items.find((item) => item.id === id),
          nextConfig.items.find((item) => item.id === id)
        )
      )
        bumpRevision(id)
    }
    overrideConfig = nextConfig
  })()
  writePromise = currentPromise.catch(() => {})
  await currentPromise
}

export async function getOverrideItem(id: string | undefined): Promise<OverrideItem | undefined> {
  const { items } = await getOverrideConfig()
  return items.find((item) => item.id === id)
}

async function updateOverrideItemUnlocked(item: OverrideItem): Promise<void> {
  const config = await getOverrideConfig()
  const index = config.items.findIndex((i) => i.id === item.id)
  if (index === -1) {
    throw new Error('Override not found')
  }
  config.items[index] = item
  await setOverrideConfigUnlocked(config)
}

export function setOverrideConfig(config: OverrideConfig): Promise<void> {
  return withMutation(() => setOverrideConfigUnlocked(config))
}
export function updateOverrideItem(item: OverrideItem): Promise<void> {
  return withMutation(() => updateOverrideItemUnlocked(item))
}
export function removeOverrideItem(id: string): Promise<void> {
  return withMutation(() => removeOverrideItemUnlocked(id))
}
export function setOverride(id: string, ext: 'js' | 'yaml', content: string): Promise<void> {
  return withMutation(() => setOverrideUnlocked(id, ext, content))
}

export async function addOverrideItem(item: Partial<OverrideItem>): Promise<void> {
  const previous = item.id ? await getOverrideItem(item.id) : undefined
  const revision = item.id ? revisions.get(item.id) || 0 : 0
  const prepared = await prepareOverride(previous && item.type === 'remote' ? previous : item)
  await withMutation(async () => {
    const config = await getOverrideConfig()
    const latest = config.items.find((item) => item.id === prepared.item.id)
    if (previous && !latest) return
    if (
      previous &&
      (!isDeepStrictEqual(latest, previous) || (revisions.get(previous.id) || 0) !== revision)
    ) {
      throw new Error(tr('Override changed during refresh. Please retry.'))
    }
    if (!previous && latest) throw new Error('Duplicate override ID')
    await setOverrideUnlocked(prepared.item.id, prepared.item.ext, prepared.content)
    prepared.item.updated = Date.now()
    if (latest)
      config.items[config.items.findIndex((item) => item.id === latest.id)] = prepared.item
    else config.items.push(prepared.item)
    await setOverrideConfigUnlocked(config)
  })
}

async function removeOverrideItemUnlocked(id: string): Promise<void> {
  const config = await getOverrideConfig()
  const item = await getOverrideItem(id)
  config.items = config.items?.filter((item) => item.id !== id)
  await setOverrideConfigUnlocked(config)
  await rm(overridePath(id, item?.ext || 'js'), { force: true })
}

async function prepareOverride(
  item: Partial<OverrideItem>
): Promise<{ item: OverrideItem; content: string }> {
  let content = ''
  const id = item.id || randomUUID()
  const newItem = {
    id,
    name: item.name || (item.type === 'remote' ? 'Remote File' : 'Local File'),
    type: item.type,
    ext: item.ext || 'js',
    url: item.url,
    fingerprint: item.fingerprint,
    ua: item.ua?.trim() || undefined,
    global: item.global || false,
    updated: new Date().getTime()
  } as OverrideItem
  switch (newItem.type) {
    case 'remote': {
      const { 'mixed-port': mixedPort = 7890 } = await getControledMihomoConfig()
      if (!item.url) throw new Error('Empty URL')
      let res: AxiosResponse
      try {
        const httpsAgent = item.fingerprint
          ? createPinnedHttpsAgent(item.url, item.fingerprint, mixedPort || undefined, {
              fingerprintMismatch: () => new Error(tr('Certificate fingerprint mismatch')),
              proxyConnectFailed: (statusCode) =>
                new Error(tr('Proxy connection failed with status code {0}', [statusCode]))
            })
          : new https.Agent({ rejectUnauthorized: true })

        res = await axios.get(item.url, {
          httpsAgent,
          ...(mixedPort != 0 &&
            !item.fingerprint && {
              proxy: { protocol: 'http', host: '127.0.0.1', port: mixedPort }
            }),
          headers: { 'User-Agent': newItem.ua || (await getUserAgent()) },
          timeout: 30_000,
          responseType: 'text'
        })
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
            throw new Error(tr('Network connection reset or timed out: {0}', [item.url]))
          } else if (error.code === 'CERT_HAS_EXPIRED') {
            throw new Error(tr('Server certificate has expired: {0}', [item.url]))
          } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
            throw new Error(tr('Unable to verify server certificate: {0}', [item.url]))
          } else if (error.message.includes('Certificate verification failed')) {
            throw new Error(tr('Certificate verification failed: {0}', [item.url]))
          } else {
            throw new Error(tr('Request failed: {0}', [error.message]))
          }
        }
        throw error
      }

      const data = res.data
      content = data
      break
    }
    case 'local': {
      const data = item.file || ''
      content = data
      break
    }
  }

  return { item: newItem, content }
}

export async function getOverride(id: string, ext: 'js' | 'yaml' | 'log'): Promise<string> {
  if (!existsSync(overridePath(id, ext))) {
    return ''
  }
  return await readFile(overridePath(id, ext), 'utf-8')
}

async function setOverrideUnlocked(id: string, ext: 'js' | 'yaml', content: string): Promise<void> {
  await writePrivateTextFileAtomic(overridePath(id, ext), content)
  bumpRevision(id)
}
