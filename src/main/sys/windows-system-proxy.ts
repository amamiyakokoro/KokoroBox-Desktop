import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { NativeSystemProxySettings } from '../../shared/proxy-diagnostics-contract'
import { dataDir } from '../utils/dirs'
import { getNativeSystemProxyDiagnostics, setNativeSystemProxy } from './native-system-proxy'

type WindowsProxyState = {
  mode: 'manual' | 'auto'
  value: string
  bypass: string
}

function ownershipPath(): string {
  return join(dataDir(), 'windows-system-proxy.json')
}

function normalizedBypass(entries: string[]): string {
  return entries
    .flatMap((entry) => entry.split(/[;,]/))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(';')
}

export async function readWindowsNativeProxyOwnership(): Promise<WindowsProxyState[]> {
  try {
    const records: unknown = JSON.parse(await readFile(ownershipPath(), 'utf8'))
    if (
      !Array.isArray(records) ||
      !records.every(
        (record) =>
          record &&
          ['manual', 'auto'].includes(record.mode) &&
          typeof record.value === 'string' &&
          typeof record.bypass === 'string'
      )
    )
      throw new Error('Invalid Windows system proxy ownership file')
    return records
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function saveOwnership(records: WindowsProxyState[]): Promise<void> {
  const file = ownershipPath()
  const temporary = `${file}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(records))
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function applyWindowsNativeProxy(
  settings: NativeSystemProxySettings & { mode: 'manual' | 'auto' },
  owned: WindowsProxyState[]
): Promise<void> {
  const next: WindowsProxyState = {
    mode: settings.mode,
    value: settings.mode === 'auto' ? settings.pacUrl! : `${settings.host}:${settings.port}`,
    bypass: normalizedBypass(settings.bypass)
  }
  const current = owned.length ? await findOwnedProxy(owned) : undefined
  // Record the pending write first so the next launch can clean up after a crash.
  await saveOwnership(current ? [next, current] : [next])
  await setNativeSystemProxy(settings)
}

async function findOwnedProxy(
  records: WindowsProxyState[]
): Promise<WindowsProxyState | undefined> {
  const current = await getNativeSystemProxyDiagnostics()
  if (current.status !== 'available' || !current.windows) {
    throw new Error(current.errorCode ?? 'Windows system proxy is unavailable')
  }
  return records.find(({ mode, value, bypass }) => {
    if (normalizedBypass(current.bypass) !== bypass) return false
    if (mode === 'auto')
      return !current.enabled && current.pac?.enabled && current.pac.url === value
    return (
      current.enabled &&
      !current.pac?.enabled &&
      current.windows?.proxyServer?.toLowerCase() === value.toLowerCase()
    )
  })
}

export async function releaseWindowsNativeProxy(records: WindowsProxyState[]): Promise<void> {
  if (await findOwnedProxy(records)) {
    await setNativeSystemProxy({ mode: 'disabled', bypass: [] })
  }
  await rm(ownershipPath(), { force: true })
}

export async function readWindowsNativeProxyEnabled(): Promise<boolean | null> {
  const records = await readWindowsNativeProxyOwnership()
  if (!records.length) return null
  return Boolean(await findOwnedProxy(records))
}
