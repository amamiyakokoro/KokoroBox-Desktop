import { appendAppLog } from '../utils/log'
import {
  recoverProfileKeyTransaction,
  writeProfileKeyTransaction,
  readProfileKeySnapshot
} from './profile-key-transaction'
import { assertManagedConfig } from '../../shared/managed-id'
import { isDeepStrictEqual } from 'node:util'
import { tr } from '../../shared/i18n'
import { getControledMihomoConfig } from './controledMihomo'
import {
  dataDir,
  mihomoProfileWorkDir,
  mihomoWorkDir,
  profileConfigPath,
  profilePath
} from '../utils/dirs'
import { addProfileUpdater, delProfileUpdater } from '../core/profileUpdater'
import { readFile, writeFile, rm, mkdir, rename } from 'fs/promises'
import { fileToStr, repairManagedFilePermissions } from 'kokorobox-native'
import { restartCore } from '../core/manager'
import { getAppConfig } from './app'
import { existsSync } from 'fs'
import axios, { AxiosResponse } from 'axios'
import https from 'https'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { defaultProfile } from '../utils/template'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { deepMerge } from '../utils/merge'
import { getUserAgent } from '../utils/userAgent'
import { decryptAgeText, encryptAgeText, isAgeEncryptedText } from '../utils/age'
import { isHttpUrl } from '../utils/url'
import { downloadKokoroProfile, type DownloadedKokoroProfile } from '../kokoro/client'
import { validateMihomoProfileContent } from '../kokoro/profile-check'
import { createPinnedHttpsAgent } from '../utils/pinnedHttpsAgent'
import { writePrivateTextFileAtomic } from './atomic-file'

let profileConfig: ProfileConfig | undefined // profile.yaml
let profileConfigWritePromise: Promise<void> = Promise.resolve()
let profileMutationPromise: Promise<unknown> = Promise.resolve()

function withProfileMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = profileMutationPromise.then(operation)
  profileMutationPromise = result.catch(() => undefined)
  return result
}

const FILE_PERMISSION_ELEVATION_REQUIRED = 'FILE_PERMISSION_ELEVATION_REQUIRED'

export async function getProfileConfig(force = false): Promise<ProfileConfig> {
  await profileConfigWritePromise
  await recoverProfileKeyTransaction(dataDir())
  if (force || !profileConfig) {
    const data = await readFile(profileConfigPath(), 'utf-8')
    profileConfig = parseYaml(data) || { items: [] }
  }
  if (typeof profileConfig !== 'object') profileConfig = { items: [] }
  assertManagedConfig(profileConfig, 'profile')
  return structuredClone(profileConfig)
}

async function setProfileConfigUnlocked(config: ProfileConfig): Promise<void> {
  assertManagedConfig(config, 'profile')
  const nextConfig = structuredClone(config)
  const previousPromise = profileConfigWritePromise
  const currentPromise = (async () => {
    await previousPromise
    await writePrivateTextFileAtomic(profileConfigPath(), stringifyYaml(nextConfig))
    profileConfig = nextConfig
  })()
  profileConfigWritePromise = currentPromise.catch(() => {})
  await currentPromise
}

export async function getProfileItem(id: string | undefined): Promise<ProfileItem | undefined> {
  const { items } = await getProfileConfig()
  if (!id || id === 'default') return { id: 'default', type: 'local', name: tr('Blank profile') }
  return items.find((item) => item.id === id)
}

async function changeCurrentProfileUnlocked(id: string): Promise<void> {
  const config = await getProfileConfig()
  if (id !== 'default' && !config.items.some((item) => item.id === id))
    throw new Error('Profile not found')
  const current = config.current
  config.current = id
  await setProfileConfigUnlocked(config)
  try {
    await restartCore({ throwOnError: true })
  } catch (error) {
    config.current = current
    await setProfileConfigUnlocked(config)
    try {
      await restartCore({ throwOnError: true })
    } catch (restoreError) {
      await appendAppLog(`[Profile]: failed to restart previous profile, ${restoreError}\n`)
    }
    throw error
  }
}

async function updateProfileItemUnlocked(item: ProfileItem): Promise<void> {
  const config = await getProfileConfig()
  const index = config.items.findIndex((i) => i.id === item.id)
  if (index === -1) {
    throw new Error('Profile not found')
  }

  const oldItem = config.items[index]
  const shouldRewriteProfile =
    oldItem.ageRecipient !== item.ageRecipient || oldItem.ageIdentity !== item.ageIdentity
  if (shouldRewriteProfile && existsSync(profilePath(item.id))) {
    const rawProfile = await readFile(profilePath(item.id), 'utf-8')
    let plaintext: string
    try {
      plaintext = await decryptProfileContent(rawProfile, oldItem)
    } catch {
      plaintext = await decryptProfileContent(rawProfile, item)
    }
    await replaceProfilePair(config, item, rawProfile, plaintext)
  } else {
    config.items[index] = item
    await setProfileConfigUnlocked(config)
  }
  if (!item.autoUpdate) await delProfileUpdater(item.id)
}

async function replaceProfilePair(
  config: ProfileConfig,
  item: ProfileItem,
  oldContent: string,
  plaintext: string
): Promise<void> {
  const nextContent = item.ageRecipient
    ? await encryptAgeText(plaintext, item.ageRecipient)
    : plaintext
  const oldConfig = stringifyYaml(config)
  config.items = config.items.map((previous) => (previous.id === item.id ? item : previous))
  profileConfig = undefined
  await writeProfileKeyTransaction(
    dataDir(),
    item.id,
    oldConfig,
    oldContent,
    stringifyYaml(config),
    nextContent
  )
  profileConfig = structuredClone(config)
}

interface AddProfileItemOptions {
  downloadedKokoroProfile?: DownloadedKokoroProfile
  restartCurrent?: boolean
  selectIfEmpty?: boolean
}

async function commitPreparedProfile(
  prepared: { item: ProfileItem; content: string },
  options: AddProfileItemOptions = {}
): Promise<string> {
  const { item: newItem, content } = prepared
  const config = await getProfileConfig()
  const previous = config.items.find((item) => item.id === newItem.id)
  const changedKey =
    previous &&
    (previous.ageIdentity !== newItem.ageIdentity || previous.ageRecipient !== newItem.ageRecipient)
  const keyTransaction = Boolean(changedKey && existsSync(profilePath(newItem.id)))
  if (keyTransaction) {
    await replaceProfilePair(
      config,
      newItem,
      await readFile(profilePath(newItem.id), 'utf8'),
      content
    )
    if (options.restartCurrent !== false && config.current === newItem.id)
      await restartCore({ throwOnError: true })
  } else {
    await writeProfileContent(newItem.id, content, newItem, options.restartCurrent !== false)
  }
  if (previous) {
    if (!keyTransaction) await updateProfileItemUnlocked(newItem)
    else if (!newItem.autoUpdate) await delProfileUpdater(newItem.id)
  } else {
    config.items.push(newItem)
    await setProfileConfigUnlocked(config)
  }

  const savedConfig = await getProfileConfig()
  if (options.selectIfEmpty !== false && !savedConfig.current) {
    await changeCurrentProfileUnlocked(newItem.id)
  }
  return newItem.id
}

export function setProfileConfig(config: ProfileConfig): Promise<void> {
  return withProfileMutation(() => setProfileConfigUnlocked(config))
}

export function changeCurrentProfile(id: string): Promise<void> {
  return withProfileMutation(() => changeCurrentProfileUnlocked(id))
}

export function updateProfileItem(item: ProfileItem): Promise<void> {
  return withProfileMutation(() => updateProfileItemUnlocked(item))
}

export function removeProfileItem(id: string): Promise<void> {
  return withProfileMutation(() => removeProfileItemUnlocked(id))
}

export function clearKokoroProfiles(): Promise<void> {
  return withProfileMutation(clearKokoroProfilesUnlocked)
}

export function setProfileStr(id: string, content: string, item?: ProfileItem): Promise<void> {
  return withProfileMutation(() => setProfileStrUnlocked(id, content, item))
}

async function addProfileItemWithOptions(
  item: Partial<ProfileItem>,
  options: AddProfileItemOptions = {}
): Promise<string> {
  const previous = item.id ? await getProfileItem(item.id) : undefined
  const prepared = await prepareProfile(item, options)
  const id = await withProfileMutation(async () => {
    if (previous) {
      const latest = await getProfileItem(previous.id)
      if (!latest) return previous.id
      if (!isDeepStrictEqual(latest, previous)) {
        throw new Error(tr('Subscription changed during refresh. Please retry.'))
      }
    }
    return await commitPreparedProfile(prepared, options)
  })
  const saved = await getProfileItem(id)
  if (saved) await addProfileUpdater(saved)
  return id
}

export async function addProfileItem(item: Partial<ProfileItem>): Promise<string> {
  // Manual and scheduled Kokoro refreshes must use the same guarded commit path.
  if (item.id && item.type === 'remote' && item.kokoro) {
    await refreshKokoroProfile(item.id)
    return item.id
  }
  return await addProfileItemWithOptions(item)
}

export async function refreshKokoroProfile(id: string): Promise<void> {
  const item = await getProfileItem(id)
  if (item?.type !== 'remote' || !item.kokoro) return
  // Keep the network wait outside the mutation queue so edits/deletions can proceed.
  const prepared = await prepareProfile(item)
  const refreshed = await withProfileMutation(async () => {
    const latest = await getProfileItem(id)
    if (!latest) return false
    if (!isDeepStrictEqual(latest, item)) {
      throw new Error(tr('Subscription changed during refresh. Please retry.'))
    }
    await commitPreparedProfile(prepared, { selectIfEmpty: false })
    return true
  })
  if (refreshed) {
    const latest = await getProfileItem(id)
    if (latest) await addProfileUpdater(latest)
  }
}

async function removeProfileItemUnlocked(id: string): Promise<void> {
  const config = await getProfileConfig()
  config.items = config.items?.filter((item) => item.id !== id)
  let shouldRestart = false
  if (config.current === id) {
    shouldRestart = true
    if (config.items.length > 0) {
      config.current = config.items[0].id
    } else {
      config.current = undefined
    }
  }
  await setProfileConfigUnlocked(config)
  if (existsSync(profilePath(id))) {
    await rm(profilePath(id))
  }
  if (shouldRestart) {
    await restartCore()
  }
  if (existsSync(mihomoProfileWorkDir(id))) {
    await rm(mihomoProfileWorkDir(id), { recursive: true })
  }
  await delProfileUpdater(id)
}

export async function getCurrentProfileItem(): Promise<ProfileItem> {
  const { current } = await getProfileConfig()
  return (
    (await getProfileItem(current)) || { id: 'default', type: 'local', name: tr('Blank profile') }
  )
}

async function prepareProfile(
  item: Partial<ProfileItem>,
  options: AddProfileItemOptions = {}
): Promise<{ item: ProfileItem; content: string }> {
  let content = ''
  const id = item.id || new Date().getTime().toString(16)
  const newItem = {
    id,
    name: item.name || (item.type === 'remote' ? 'Remote File' : 'Local File'),
    type: item.type,
    url: item.url,
    fingerprint: item.fingerprint,
    ua: item.ua,
    verify: item.verify ?? false,
    autoUpdate: item.autoUpdate ?? true,
    interval: item.interval || 0,
    override: item.override || [],
    useProxy: item.useProxy || false,
    ageRecipient: item.ageRecipient?.trim() || undefined,
    ageIdentity: item.ageIdentity?.trim() || undefined,
    kokoro: item.kokoro,
    updated: new Date().getTime()
  } as ProfileItem
  switch (newItem.type) {
    case 'remote': {
      if (newItem.kokoro) {
        const downloaded =
          options.downloadedKokoroProfile ?? (await downloadKokoroProfile(newItem.kokoro.settings))
        parseYaml<MihomoConfig>(downloaded.content)
        await validateMihomoProfileContent(downloaded.content)
        newItem.name = item.name || downloaded.profileName
        newItem.verify = true
        newItem.autoUpdate = newItem.kokoro.settings.profile_auto_update
        newItem.interval = downloaded.profileUpdateInterval
          ? downloaded.profileUpdateInterval * 60
          : 0
        if (downloaded.subscriptionUserinfo) {
          newItem.extra = parseSubinfo(downloaded.subscriptionUserinfo)
        }
        content = downloaded.content
        break
      }

      const { 'mixed-port': mixedPort = 7890 } = await getControledMihomoConfig()
      if (!item.url) throw new Error('Empty URL')
      let res: AxiosResponse
      try {
        const httpsAgent = item.fingerprint
          ? createPinnedHttpsAgent(
              item.url,
              item.fingerprint,
              newItem.useProxy && mixedPort != 0 ? mixedPort : undefined,
              {
                fingerprintMismatch: () => new Error(tr('Certificate fingerprint mismatch')),
                proxyConnectFailed: (statusCode) =>
                  new Error(tr('Proxy connection failed with status code {0}', [statusCode]))
              }
            )
          : new https.Agent({ rejectUnauthorized: true })

        res = await axios.get(item.url, {
          httpsAgent,
          ...(newItem.useProxy &&
            mixedPort &&
            !item.fingerprint && {
              proxy: { protocol: 'http', host: '127.0.0.1', port: mixedPort }
            }),
          headers: { 'User-Agent': newItem.ua || (await getUserAgent()) },
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

      const data = await decryptProfileContent(String(res.data), newItem)
      const headers = res.headers
      const contentDispositionKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('content-disposition')
      )
      if (contentDispositionKey && newItem.name === 'Remote File') {
        newItem.name = parseFilename(headers[contentDispositionKey])
      }
      const homeKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('profile-web-page-url')
      )
      if (homeKey) {
        const home = headers[homeKey]
        if (isHttpUrl(home)) {
          newItem.home = home
        }
      }
      const intervalKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('profile-update-interval')
      )
      if (intervalKey) {
        newItem.interval = parseInt(headers[intervalKey]) * 60
        if (newItem.interval) {
          newItem.locked = true
        }
      }
      const userinfoKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('subscription-userinfo')
      )
      if (userinfoKey) {
        newItem.extra = parseSubinfo(headers[userinfoKey])
      }
      if (newItem.verify) {
        try {
          parseYaml<MihomoConfig>(data)
        } catch (error) {
          throw new Error(
            tr('Invalid subscription format: cannot parse a valid configuration\n') +
              (error as Error).message
          )
        }
      }
      content = data
      break
    }
    case 'local': {
      const data = await decryptProfileContent(item.file || '', newItem)
      content = data
      break
    }
  }
  return { item: newItem, content }
}

export async function getProfileStr(id: string | undefined): Promise<string> {
  const snapshot = await readProfileKeySnapshot(dataDir(), id || 'default')
  return snapshot.content === undefined
    ? stringifyYaml(defaultProfile)
    : await decryptProfileContent(snapshot.content, snapshot.item)
}

export async function addKokoroProfile(settings: KokoroSubscriptionSettings): Promise<string> {
  const normalizedSettings = { ...settings, format: 'mihomo' } as const
  const downloaded = await downloadKokoroProfile(normalizedSettings)
  const config = await getProfileConfig()
  const matchingProfiles = config.items.filter(
    (item) => item.kokoro && item.name === downloaded.profileName
  )
  const existingProfile =
    matchingProfiles.find((item) => item.id === config.current) ?? matchingProfiles[0]

  const newProfileId = await addProfileItemWithOptions(
    {
      ...existingProfile,
      type: 'remote',
      name: downloaded.profileName,
      verify: true,
      autoUpdate: settings.profile_auto_update,
      interval: settings.profile_auto_update ? settings.profile_update_hours * 60 : 0,
      kokoro: { settings: normalizedSettings }
    },
    {
      downloadedKokoroProfile: downloaded,
      restartCurrent: false,
      selectIfEmpty: false
    }
  )
  for (const duplicate of matchingProfiles) {
    if (duplicate.id !== existingProfile?.id) {
      await removeProfileItem(duplicate.id)
    }
  }
  await changeCurrentProfile(newProfileId)
  return newProfileId
}

async function clearKokoroProfilesUnlocked(): Promise<void> {
  const config = await getProfileConfig()
  const removed = config.items.filter((item) => item.kokoro)
  if (removed.length === 0) return

  const removedIds = new Set(removed.map((item) => item.id))
  config.items = config.items.filter((item) => !removedIds.has(item.id))
  const currentRemoved = Boolean(config.current && removedIds.has(config.current))
  if (currentRemoved) config.current = config.items[0]?.id
  await setProfileConfigUnlocked(config)

  await Promise.all(
    removed.map(async (item) => {
      await delProfileUpdater(item.id)
      await rm(profilePath(item.id), { force: true })
      await rm(mihomoProfileWorkDir(item.id), { recursive: true, force: true })
    })
  )
  if (currentRemoved) await restartCore()
}

export async function getProfileParseStr(id: string | undefined): Promise<string> {
  const data = await getProfileStr(id)
  const profile = deepMerge(parseYaml<object>(data), {})
  return stringifyYaml(profile)
}

async function setProfileStrUnlocked(
  id: string,
  content: string,
  item?: ProfileItem
): Promise<void> {
  await writeProfileContent(id, content, item, true)
}

async function decryptProfileContent(
  content: string,
  item: ProfileItem | undefined
): Promise<string> {
  if (!isAgeEncryptedText(content)) return content
  if (!item?.ageIdentity) {
    throw new Error(
      tr('{0} is encrypted with age. Enter your age private key first', [
        item?.name || tr('Configuration')
      ])
    )
  }
  return await decryptAgeText(content, item.ageIdentity)
}

async function writeProfileContent(
  id: string,
  content: string,
  item: ProfileItem | undefined,
  shouldRestartCurrent: boolean
): Promise<void> {
  const { current } = await getProfileConfig()
  const profileItem = item || (await getProfileItem(id))
  const data = profileItem?.ageRecipient
    ? await encryptAgeText(content, profileItem.ageRecipient)
    : content

  const targetPath = profilePath(id)
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(tempPath, data, { encoding: 'utf-8', mode: 0o600 })
    await rename(tempPath, targetPath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
  if (shouldRestartCurrent && current === id) await restartCore({ throwOnError: true })
}

export async function getProfile(id: string | undefined): Promise<MihomoConfig> {
  const profile = await getProfileStr(id)
  let result = parseYaml<MihomoConfig>(profile)
  if (typeof result !== 'object') result = {} as MihomoConfig
  return result
}

// attachment;filename=xxx.yaml; filename*=UTF-8''%xx%xx%xx
function parseFilename(str: string): string {
  if (str.match(/filename\*=.*''/)) {
    const filename = decodeURIComponent(str.split(/filename\*=.*''/)[1])
    return filename
  } else {
    const filename = str.split('filename=')[1]
    return filename
  }
}

// subscription-userinfo: upload=1234; download=2234; total=1024000; expire=2218532293
function parseSubinfo(str: string): SubscriptionUserInfo {
  const parts = str.split(';')
  const obj = {} as SubscriptionUserInfo
  parts.forEach((part) => {
    const [key, value] = part.trim().split('=')
    obj[key] = parseInt(value)
  })
  return obj
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:\\/.test(path)
}

function resolveEditableFilePath(
  path: string,
  current: string | undefined,
  diffWorkDir: boolean
): string {
  if (isAbsolutePath(path)) {
    return path
  }
  return join(diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(), path)
}

function isSubPath(base: string, target: string): boolean {
  const relativePath = relative(resolve(base), resolve(target))
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = 'code' in error ? error.code : undefined
  return code === 'EACCES' || code === 'EPERM'
}

function managedEditableRoot(target: string, current: string | undefined): string | undefined {
  return [mihomoWorkDir(), mihomoProfileWorkDir(current)].find((root) => isSubPath(root, target))
}

async function repairEditableFilePermissions(
  target: string,
  current: string | undefined
): Promise<void> {
  const managedRoot =
    process.platform !== 'win32' ? managedEditableRoot(target, current) : undefined
  if (!managedRoot) {
    return
  }

  const uid = process.getuid?.()
  const gid = process.getgid?.()
  if (uid == null || gid == null) {
    return
  }

  await repairManagedFilePermissions(target, managedRoot, uid, gid)
}

async function attemptWriteFile(target: string, content: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content, 'utf-8')
}

async function writeEditableFile(
  target: string,
  content: string,
  current: string | undefined,
  elevate = false
): Promise<void> {
  try {
    await attemptWriteFile(target, content)
  } catch (error) {
    if (!isPermissionError(error)) {
      throw error
    }

    if (!elevate) {
      if (process.platform !== 'win32' && managedEditableRoot(target, current)) {
        throw new Error(FILE_PERMISSION_ELEVATION_REQUIRED)
      }
      throw error
    }

    await repairEditableFilePermissions(target, current)
    await attemptWriteFile(target, content)
  }
}

export async function getFileStr(path: string, ageSecretKey?: string): Promise<string> {
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  const content = await readFile(resolveEditableFilePath(path, current, diffWorkDir), 'utf-8')
  if (!isAgeEncryptedText(content)) {
    return content
  }

  if (!ageSecretKey) {
    throw new Error(tr('This content is encrypted with age. Configure your age private key first'))
  }

  return await decryptAgeText(content, ageSecretKey)
}

export async function getFilePreviewStr(path: string, format?: string): Promise<string> {
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  const target = resolveEditableFilePath(path, current, diffWorkDir)
  if (format !== 'MrsRule') {
    return await readFile(target, 'utf-8')
  }

  return await convertMrsRuleToText(target)
}

async function convertMrsRuleToText(path: string): Promise<string> {
  const result = fileToStr(path, {
    outputTarget: 'mihomo',
    outputFormat: 'text',
    outputBehavior: 'auto'
  })
  let text = ''
  for (const output of Object.values(result.outputs)) {
    text += text ? `\n${output}` : output
  }
  if (!text) {
    return ''
  }
  return text
}

export async function setFileStr(path: string, content: string): Promise<void> {
  return await saveFileStr(path, content, false)
}

export async function saveFileStrWithElevation(path: string, content: string): Promise<void> {
  return await saveFileStr(path, content, true)
}

async function saveFileStr(path: string, content: string, elevate: boolean): Promise<void> {
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  const target = resolveEditableFilePath(path, current, diffWorkDir)
  await writeEditableFile(target, content, current, elevate)
}
